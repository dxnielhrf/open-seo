import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { sort } from "remeda";
import { z } from "zod";
import { BingConnectionRepository } from "@/server/features/bing/BingConnectionRepository";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import {
  BingApiError,
  callBing,
  parseBingDate,
  type BingMethod,
} from "@/server/lib/bingClient";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

// Fork (Bing Webmaster Tools): connect a project to a Bing site with an API
// key, and read its traffic, queries, pages and crawl stats.

const REPORT_DAYS = 28;
const TOP_ROWS = 10;

async function getEncryptionKey(): Promise<string> {
  const secret = (await getOptionalEnvValue("BETTER_AUTH_SECRET"))?.trim();
  if (!secret) {
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      "Set BETTER_AUTH_SECRET to store a Bing API key. It encrypts the key.",
    );
  }
  return secret;
}

const siteSchema = z.looseObject({
  Url: z.string(),
  IsVerified: z.boolean().optional(),
});
const statRowSchema = z.looseObject({
  Date: z.string(),
  Clicks: z.number().optional(),
  Impressions: z.number().optional(),
  Query: z.string().optional(),
  AvgImpressionPosition: z.number().optional(),
});
const crawlRowSchema = z.looseObject({
  Date: z.string(),
  CrawledPages: z.number().optional(),
  InIndex: z.number().optional(),
  CrawlErrors: z.number().optional(),
  Code4xx: z.number().optional(),
  Code5xx: z.number().optional(),
  BlockedByRobotsTxt: z.number().optional(),
  InLinks: z.number().optional(),
});

/** Keeps the rows Bing sent in the expected shape and drops the rest. */
function parseRows<T>(schema: z.ZodType<T>, payload: unknown): T[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((row) => {
    const parsed = schema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.replace(/^www\./, "").toLowerCase();
  }
};

type ConnectResult =
  | { connected: true; siteUrl: string }
  | {
      connected: false;
      problem: "invalid_key" | "site_not_found" | "failed";
      sites: string[];
    };

async function connect(input: {
  projectId: string;
  organizationId: string;
  userId: string;
  apiKey: string;
  siteUrl?: string;
}): Promise<ConnectResult> {
  const key = await getEncryptionKey();
  let sites: z.infer<typeof siteSchema>[];
  try {
    sites = parseRows(siteSchema, await callBing("GetUserSites", input.apiKey));
  } catch (error) {
    if (!(error instanceof BingApiError)) throw error;
    return { connected: false, problem: error.kind, sites: [] };
  }
  const project = await ProjectRepository.getProjectForOrganization(
    input.projectId,
    input.organizationId,
  );
  if (!project) throw new AppError("NOT_FOUND");

  const wanted = input.siteUrl?.trim();
  const verified = sites.filter((site) => site.IsVerified !== false);
  const site = wanted
    ? verified.find((s) => s.Url === wanted)
    : (verified.find(
        (s) => project.domain && hostOf(s.Url) === hostOf(project.domain),
      ) ?? (verified.length === 1 ? verified[0] : undefined));
  if (!site) {
    return {
      connected: false,
      problem: "site_not_found",
      sites: verified.map((s) => s.Url),
    };
  }

  await BingConnectionRepository.upsert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    siteUrl: site.Url,
    encryptedApiKey: await symmetricEncrypt({ key, data: input.apiKey }),
    connectedByUserId: input.userId,
  });
  return { connected: true, siteUrl: site.Url };
}

async function getStatus(projectId: string) {
  const connection = await BingConnectionRepository.getByProjectId(projectId);
  return {
    connected: Boolean(connection),
    siteUrl: connection?.siteUrl ?? null,
    connectedAt: connection?.createdAt ?? null,
  };
}

async function disconnect(projectId: string): Promise<void> {
  await BingConnectionRepository.deleteByProjectId(projectId);
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sumBetween(
  rows: z.infer<typeof statRowSchema>[],
  from: string,
  to: string,
) {
  let clicks = 0;
  let impressions = 0;
  for (const row of rows) {
    const day = parseBingDate(row.Date);
    if (!day || day < from || day > to) continue;
    clicks += row.Clicks ?? 0;
    impressions += row.Impressions ?? 0;
  }
  return { clicks, impressions };
}

/** Query or page rows since `from`, summed per key, by impressions. */
function topRows(rows: z.infer<typeof statRowSchema>[], from: string) {
  const byKey = new Map<
    string,
    { key: string; clicks: number; impressions: number; positions: number[] }
  >();
  for (const row of rows) {
    const day = parseBingDate(row.Date);
    if (!day || day < from || !row.Query) continue;
    const entry = byKey.get(row.Query) ?? {
      key: row.Query,
      clicks: 0,
      impressions: 0,
      positions: [],
    };
    entry.clicks += row.Clicks ?? 0;
    entry.impressions += row.Impressions ?? 0;
    // Bing reports -1 when there is no position.
    if (
      row.AvgImpressionPosition !== undefined &&
      row.AvgImpressionPosition > 0
    )
      entry.positions.push(row.AvgImpressionPosition);
    byKey.set(row.Query, entry);
  }
  return sort(
    [...byKey.values()],
    (a, b) => b.impressions - a.impressions || b.clicks - a.clicks,
  )
    .slice(0, TOP_ROWS)
    .map(({ positions, ...entry }) => ({
      ...entry,
      position:
        positions.length > 0
          ? Math.round(
              (positions.reduce((sum, value) => sum + value, 0) /
                positions.length) *
                10,
            ) / 10
          : null,
    }));
}

/**
 * The last 28 days against the 28 before them, the top queries and pages, and
 * the latest crawl snapshot. Each Bing method is fetched on its own, so one
 * failing leaves the others; a rejected key fails the whole report.
 */
async function openConnection(projectId: string) {
  const connection = await BingConnectionRepository.getByProjectId(projectId);
  if (!connection) return null;
  const apiKey = await symmetricDecrypt({
    key: await getEncryptionKey(),
    data: connection.encryptedApiKey,
  });
  return { siteUrl: connection.siteUrl, apiKey };
}

/** Runs Bing calls side by side; a failed call yields null and an error. */
async function settleCalls(calls: Promise<unknown>[]) {
  const settled = await Promise.allSettled(calls);
  const errors: string[] = [];
  let invalidKey = false;
  const payloads = settled.map((result) => {
    if (result.status === "fulfilled") return result.value;
    if (result.reason instanceof BingApiError) {
      if (result.reason.kind === "invalid_key") invalidKey = true;
      if (!errors.includes(result.reason.message))
        errors.push(result.reason.message);
    } else {
      errors.push("Bing request failed");
    }
    return null;
  });
  return { payloads, errors, invalidKey };
}

async function getReport(projectId: string, today = new Date()) {
  const connection = await openConnection(projectId);
  if (!connection) return { connected: false as const };
  const { apiKey } = connection;

  const methods = [
    "GetRankAndTrafficStats",
    "GetQueryStats",
    "GetPageStats",
    "GetCrawlStats",
  ] as const satisfies BingMethod[];
  const { payloads, errors, invalidKey } = await settleCalls(
    methods.map((method) => callBing(method, apiKey, connection.siteUrl)),
  );
  const [traffic, queries, pages, crawl] = [
    parseRows(statRowSchema, payloads[0]),
    parseRows(statRowSchema, payloads[1]),
    parseRows(statRowSchema, payloads[2]),
    parseRows(crawlRowSchema, payloads[3]),
  ];

  const end = today.toISOString().slice(0, 10);
  const start = addDays(end, -(REPORT_DAYS - 1));
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(REPORT_DAYS - 1));

  const trend = sort(
    traffic
      .map((row) => ({
        date: parseBingDate(row.Date) ?? "",
        clicks: row.Clicks ?? 0,
        impressions: row.Impressions ?? 0,
      }))
      .filter((row) => row.date >= start && row.date <= end),
    (a, b) => a.date.localeCompare(b.date),
  );

  const latestCrawl = sort(
    crawl.map((row) => ({ ...row, day: parseBingDate(row.Date) ?? "" })),
    (a, b) => a.day.localeCompare(b.day),
  ).at(-1);

  return {
    connected: true as const,
    siteUrl: connection.siteUrl,
    invalidKey,
    // Bing has no rows at all until it has processed the site.
    processing:
      errors.length === 0 &&
      traffic.length + queries.length + pages.length + crawl.length === 0,
    errors,
    range: { start, end },
    totals: sumBetween(traffic, start, end),
    prevTotals: sumBetween(traffic, prevStart, prevEnd),
    trend,
    topQueries: topRows(queries, start).map(({ key, ...row }) => ({
      query: key,
      ...row,
    })),
    topPages: topRows(pages, start).map(({ key, ...row }) => ({
      page: key,
      ...row,
    })),
    crawl: latestCrawl
      ? {
          date: latestCrawl.day,
          crawledPages: latestCrawl.CrawledPages ?? null,
          inIndex: latestCrawl.InIndex ?? null,
          crawlErrors: latestCrawl.CrawlErrors ?? null,
          code4xx: latestCrawl.Code4xx ?? null,
          code5xx: latestCrawl.Code5xx ?? null,
          blockedByRobotsTxt: latestCrawl.BlockedByRobotsTxt ?? null,
          inLinks: latestCrawl.InLinks ?? null,
        }
      : null,
  };
}

const LINK_TARGETS = 10;
const linkCountsSchema = z.looseObject({
  Links: z
    .array(z.looseObject({ Url: z.string(), Count: z.number().optional() }))
    .optional(),
});
const linkDetailsSchema = z.looseObject({
  Details: z
    .array(z.looseObject({ Url: z.string(), AnchorText: z.string().nullish() }))
    .optional(),
});

/**
 * Inbound links Bing knows of: the site's pages with their link counts, and
 * for the 10 most linked pages the linking URLs with anchor text, summed per
 * referring domain. Only the first result page of each Bing call is read.
 */
async function getBacklinks(projectId: string) {
  const connection = await openConnection(projectId);
  if (!connection) return { connected: false as const };
  const { apiKey, siteUrl } = connection;

  const counts = await settleCalls([
    callBing("GetLinkCounts", apiKey, siteUrl, { page: "0" }),
  ]);
  const parsedCounts = linkCountsSchema.safeParse(counts.payloads[0]);
  const targets = sort(
    (parsedCounts.success ? (parsedCounts.data.Links ?? []) : []).map(
      (link) => ({ url: link.Url, count: link.Count ?? 0 }),
    ),
    (a, b) => b.count - a.count,
  );

  const details = await settleCalls(
    targets.slice(0, LINK_TARGETS).map((target) =>
      callBing("GetUrlLinks", apiKey, siteUrl, {
        link: target.url,
        page: "0",
      }),
    ),
  );
  const links = details.payloads.flatMap((payload, index) => {
    const parsed = linkDetailsSchema.safeParse(payload);
    const target = targets[index]?.url ?? "";
    return (parsed.success ? (parsed.data.Details ?? []) : []).map(
      (detail) => ({
        source: detail.Url,
        sourceDomain: hostOf(detail.Url),
        target,
        anchorText: detail.AnchorText?.trim() || null,
      }),
    );
  });

  const byDomain = new Map<string, number>();
  for (const link of links) {
    byDomain.set(link.sourceDomain, (byDomain.get(link.sourceDomain) ?? 0) + 1);
  }
  const domains = sort(
    [...byDomain].map(([domain, count]) => ({ domain, links: count })),
    (a, b) => b.links - a.links || a.domain.localeCompare(b.domain),
  );

  return {
    connected: true as const,
    siteUrl,
    invalidKey: counts.invalidKey || details.invalidKey,
    errors: [...new Set([...counts.errors, ...details.errors])],
    totalLinks: targets.reduce((sum, target) => sum + target.count, 0),
    targets,
    domains,
    links,
  };
}

export type BingReport = Awaited<ReturnType<typeof getReport>>;

export const BingService = {
  connect,
  getStatus,
  disconnect,
  getReport,
  getBacklinks,
};
