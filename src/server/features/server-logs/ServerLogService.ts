import { z } from "zod";
import { ServerLogRepository } from "@/server/features/server-logs/ServerLogRepository";
import {
  AI_BOTS,
  SERVER_LOG_BOTS,
  type ServerLogBot,
  type ServerLogBreakdown,
  type ServerLogStatusFilter,
} from "@/server/features/server-logs/serverLogBots";

// Fork (server logs): an external script aggregates the web server's access
// logs per day (path, status, bot class) and posts the totals with a project
// ingest token. Only these aggregates are stored.

export const MAX_ROWS_PER_DAY = 5000;

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Creates or replaces the project's ingest token; the plain token is shown once. */
async function createToken(projectId: string): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = `osl_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  await ServerLogRepository.setToken(projectId, await sha256(token));
  return token;
}

export const ingestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rows: z
    .array(
      z.object({
        path: z.string().min(1).max(300),
        status: z.number().int().min(100).max(599),
        bot: z.enum(SERVER_LOG_BOTS),
        hits: z.number().int().min(1),
      }),
    )
    .max(MAX_ROWS_PER_DAY),
});

type IngestResult =
  | { ok: true; projectId: string; rows: number }
  | { ok: false; status: 401 | 400; error: string };

async function ingest(
  authorization: string | null,
  body: unknown,
): Promise<IngestResult> {
  const token = /^Bearer (osl_[0-9a-f]{64})$/.exec(authorization ?? "")?.[1];
  const source = token
    ? await ServerLogRepository.getSourceByTokenHash(await sha256(token))
    : null;
  if (!source) return { ok: false, status: 401, error: "invalid token" };
  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, error: "invalid body" };
  }
  await ServerLogRepository.replaceDay({
    projectId: source.projectId,
    date: parsed.data.date,
    rows: parsed.data.rows,
  });
  return {
    ok: true,
    projectId: source.projectId,
    rows: parsed.data.rows.length,
  };
}

async function getStatus(projectId: string) {
  const source = await ServerLogRepository.getSource(projectId);
  return {
    connected: Boolean(source),
    lastIngestAt: source?.lastIngestAt ?? null,
    lastIngestDate: source?.lastIngestDate ?? null,
  };
}

function lastDays(days: number, now = new Date()) {
  const end = new Date(now.getTime() - 86_400_000);
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export type ServerLogStatsRow = {
  date?: string;
  bot?: string;
  path?: string;
  status?: number;
  hits: number;
};

async function getStats(input: {
  projectId: string;
  startDate?: string;
  endDate?: string;
  breakdown: ServerLogBreakdown;
  bots?: readonly ServerLogBot[] | "ai";
  status?: ServerLogStatusFilter;
  limit?: number;
}) {
  const source = await ServerLogRepository.getSource(input.projectId);
  if (!source) return { connected: false as const };
  const range =
    input.startDate && input.endDate
      ? { startDate: input.startDate, endDate: input.endDate }
      : lastDays(7);
  const rows = await ServerLogRepository.aggregate({
    projectId: input.projectId,
    ...range,
    breakdown: input.breakdown,
    bots: input.bots === "ai" ? AI_BOTS : input.bots,
    status: input.status ?? "all",
    limit: input.limit ?? 100,
  });
  // shortcut: the query selects every column and SQLite fills the ungrouped
  // ones with an arbitrary row's value; keep only the grouped fields.
  // Postgres would reject the query; the fork's standalone edition is SQLite.
  const keep = {
    bot: ["bot"],
    path: ["path"],
    status: ["status"],
    bot_and_path: ["bot", "path"],
    date: ["date"],
  }[input.breakdown];
  return {
    connected: true as const,
    lastIngestAt: source.lastIngestAt,
    lastIngestDate: source.lastIngestDate,
    range,
    breakdown: input.breakdown,
    rows: rows.map(
      (row): ServerLogStatsRow => ({
        hits: row.hits,
        ...(keep.includes("date") ? { date: row.date } : {}),
        ...(keep.includes("bot") ? { bot: row.bot } : {}),
        ...(keep.includes("path") ? { path: row.path } : {}),
        ...(keep.includes("status") ? { status: row.status } : {}),
      }),
    ),
  };
}

/** Dashboard card: AI crawler hits, their top pages, and error counts. */
async function getAiCrawlerSummary(projectId: string) {
  const [byBot, topPaths, errors] = await Promise.all([
    getStats({ projectId, breakdown: "bot", limit: 20 }),
    getStats({ projectId, breakdown: "bot_and_path", bots: "ai", limit: 10 }),
    getStats({ projectId, breakdown: "status", status: "errors", limit: 20 }),
  ]);
  if (!byBot.connected || !topPaths.connected || !errors.connected) {
    return { connected: false as const };
  }
  return {
    connected: true as const,
    lastIngestDate: byBot.lastIngestDate,
    range: byBot.range,
    byBot: byBot.rows,
    topAiPaths: topPaths.rows,
    errors: errors.rows,
  };
}

export const ServerLogService = {
  createToken,
  ingest,
  getStatus,
  getStats,
  getAiCrawlerSummary,
  disconnect: ServerLogRepository.deleteSource,
};
