import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { sort } from "remeda";
import { z } from "zod";
import { ClarityRepository } from "@/server/features/clarity/ClarityRepository";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import {
  CLARITY_DIMENSIONS,
  ClarityApiError,
  fetchClarityInsights,
  type ClarityDimension,
} from "@/server/lib/clarityClient";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

// Fork (Microsoft Clarity): connect a project with a Clarity Data Export token,
// store a daily snapshot (site totals plus URL, Source and Device breakdowns:
// 4 of Clarity's 10 requests per day), and read the history back.

const TOP_ROWS = 15;

async function getEncryptionKey(): Promise<string> {
  const secret = (await getOptionalEnvValue("BETTER_AUTH_SECRET"))?.trim();
  if (!secret) {
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      "Set BETTER_AUTH_SECRET to store a Clarity token. It encrypts the token.",
    );
  }
  return secret;
}

/** The 24-hour window ending at `fetchedAt` is labelled by its midpoint's UTC day. */
export function snapshotDateFor(fetchedAt: Date): string {
  return new Date(fetchedAt.getTime() - 12 * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

type Row = Record<string, number | string>;
type Metrics = Record<string, Row[]>;

const metricSchema = z.looseObject({
  metricName: z.string(),
  information: z.array(z.record(z.string(), z.unknown())),
});

/** Clarity's array → { metricName: rows }, numeric strings as numbers. */
export function parseClarityMetrics(raw: unknown): Metrics {
  const metrics: Metrics = {};
  if (!Array.isArray(raw)) return metrics;
  for (const entry of raw) {
    const parsed = metricSchema.safeParse(entry);
    if (!parsed.success) continue;
    metrics[parsed.data.metricName] = parsed.data.information.map((item) => {
      const row: Row = {};
      for (const [key, value] of Object.entries(item)) {
        if (typeof value === "number") row[key] = value;
        else if (typeof value === "string") {
          const n = Number(value);
          row[key] = value.trim() !== "" && Number.isFinite(n) ? n : value;
        }
      }
      return row;
    });
  }
  return metrics;
}

// Counts add up across days; rates, averages, depth and time are averaged.
const isAverage = (metric: string, field: string) =>
  /percent|average|avg|depth|time|persession/i.test(`${metric} ${field}`);

/**
 * Combines several days per metric. Rows are matched by their text fields
 * (URL, device, page title…), so list metrics such as Popular Pages and
 * dimension breakdowns keep one row per value, sorted and cut to the top 15.
 */
export function combineDays(days: Metrics[]): Record<string, Row[]> {
  const groups = new Map<string, Map<string, Row[]>>();
  for (const metrics of days) {
    for (const [metric, rows] of Object.entries(metrics)) {
      const byLabel = groups.get(metric) ?? new Map<string, Row[]>();
      groups.set(metric, byLabel);
      for (const row of rows) {
        const label = JSON.stringify(
          Object.entries(row).filter(([, v]) => typeof v === "string"),
        );
        byLabel.set(label, [...(byLabel.get(label) ?? []), row]);
      }
    }
  }
  const result: Record<string, Row[]> = {};
  for (const [metric, byLabel] of groups) {
    const combined = [...byLabel.values()].map((rows) => {
      const row: Row = {};
      for (const field of new Set(rows.flatMap((r) => Object.keys(r)))) {
        const values = rows.map((r) => r[field]);
        if (typeof values[0] === "string") {
          row[field] = values[0];
          continue;
        }
        const numbers = values.filter((v): v is number => typeof v === "number");
        const sum = numbers.reduce((a, b) => a + b, 0);
        row[field] = isAverage(metric, field)
          ? Math.round((sum / numbers.length) * 100) / 100
          : sum;
      }
      return row;
    });
    result[metric] = sort(
      combined,
      (a, b) => firstNumber(b) - firstNumber(a),
    ).slice(0, TOP_ROWS);
  }
  return result;
}

function firstNumber(row: Row): number {
  return Object.values(row).find((v) => typeof v === "number") ?? 0;
}

/** Only the metrics that are one site-wide row (no lists), for daily trends. */
function scalarMetrics(metrics: Metrics): Record<string, Row> {
  return Object.fromEntries(
    Object.entries(metrics).flatMap(([metric, rows]) =>
      rows.length === 1 && rows[0] ? [[metric, rows[0]]] : [],
    ),
  );
}

type ConnectResult =
  | { connected: true; snapshotError: string | null }
  | { connected: false; problem: "invalid_token" | "rate_limited" | "failed" };

/** Fetches totals and the breakdowns for one project and stores them. */
async function snapshot(
  projectId: string,
  token: string,
  now = new Date(),
  totals?: unknown,
): Promise<string | null> {
  const fetchedAt = now.toISOString();
  const snapshotDate = snapshotDateFor(now);
  const errors: string[] = [];
  const dimensions: (ClarityDimension | undefined)[] = [
    undefined,
    ...CLARITY_DIMENSIONS,
  ];
  for (const dimension of dimensions) {
    try {
      const data =
        dimension === undefined && totals !== undefined
          ? totals
          : await fetchClarityInsights(token, dimension);
      await ClarityRepository.saveSnapshot({
        projectId,
        snapshotDate,
        dimension: dimension ?? "",
        data: JSON.stringify(data),
        fetchedAt,
      });
    } catch (error) {
      if (!(error instanceof ClarityApiError)) throw error;
      errors.push(error.message);
      if (error.kind !== "failed") break; // more calls won't succeed today
    }
  }
  const error = errors.length > 0 ? errors.join("; ") : null;
  await ClarityRepository.setSnapshotResult(projectId, {
    at: fetchedAt,
    error,
  });
  return error;
}

async function connect(input: {
  projectId: string;
  organizationId: string;
  userId: string;
  token: string;
  clarityProjectId?: string;
}): Promise<ConnectResult> {
  const key = await getEncryptionKey();
  const project = await ProjectRepository.getProjectForOrganization(
    input.projectId,
    input.organizationId,
  );
  if (!project) throw new AppError("NOT_FOUND");
  // The totals call checks the token and becomes today's first snapshot.
  let totals: unknown;
  try {
    totals = await fetchClarityInsights(input.token);
  } catch (error) {
    if (!(error instanceof ClarityApiError)) throw error;
    return { connected: false, problem: error.kind };
  }
  await ClarityRepository.upsert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    clarityProjectId: input.clarityProjectId?.trim() || null,
    encryptedToken: await symmetricEncrypt({ key, data: input.token }),
    connectedByUserId: input.userId,
  });
  const snapshotError = await snapshot(
    input.projectId,
    input.token,
    new Date(),
    totals,
  );
  return { connected: true, snapshotError };
}

/** Daily cron: one snapshot per connected project. Never throws per project. */
async function runDailySnapshots(): Promise<{ ok: number; failed: number }> {
  const connections = await ClarityRepository.listAll();
  if (connections.length === 0) return { ok: 0, failed: 0 };
  const key = await getEncryptionKey();
  let ok = 0;
  let failed = 0;
  for (const connection of connections) {
    try {
      const token = await symmetricDecrypt({
        key,
        data: connection.encryptedToken,
      });
      const error = await snapshot(connection.projectId, token);
      if (error) failed++;
      else ok++;
    } catch (error) {
      failed++;
      console.error("[clarity] snapshot failed", connection.projectId, error);
    }
  }
  return { ok, failed };
}

async function getStatus(projectId: string) {
  const connection = await ClarityRepository.getByProjectId(projectId);
  return {
    connected: Boolean(connection),
    clarityProjectId: connection?.clarityProjectId ?? null,
    lastSnapshotAt: connection?.lastSnapshotAt ?? null,
    lastError: connection?.lastError ?? null,
  };
}

async function disconnect(projectId: string): Promise<void> {
  // Stored snapshots stay; they go when the project is deleted.
  await ClarityRepository.deleteByProjectId(projectId);
}

export type ClarityInsights =
  | { connected: false }
  | {
      connected: true;
      clarityProjectId: string | null;
      lastSnapshotAt: string | null;
      lastError: string | null;
      range: { start: string; end: string; days: number };
      snapshotDays: number;
      totals: Record<string, Row[]>;
      daily: { date: string; metrics: Record<string, Row> }[];
      dimension: ClarityDimension | null;
      breakdown: Record<string, Row[]> | null;
    };

async function getInsights(
  projectId: string,
  days: number,
  dimension: ClarityDimension | null,
  now = new Date(),
): Promise<ClarityInsights> {
  const connection = await ClarityRepository.getByProjectId(projectId);
  if (!connection) return { connected: false };
  const end = snapshotDateFor(now);
  const startDate = new Date(`${end}T00:00:00Z`);
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
  const start = startDate.toISOString().slice(0, 10);

  const totalRows = await ClarityRepository.listSnapshots(projectId, "", start);
  const parsedDays = totalRows.map((row) => ({
    date: row.snapshotDate,
    metrics: parseClarityMetrics(JSON.parse(row.data)),
  }));
  let breakdown: Record<string, Row[]> | null = null;
  if (dimension) {
    const rows = await ClarityRepository.listSnapshots(
      projectId,
      dimension,
      start,
    );
    breakdown = combineDays(
      rows.map((row) => parseClarityMetrics(JSON.parse(row.data))),
    );
  }
  return {
    connected: true,
    clarityProjectId: connection.clarityProjectId,
    lastSnapshotAt: connection.lastSnapshotAt,
    lastError: connection.lastError,
    range: { start, end, days },
    snapshotDays: parsedDays.length,
    totals: combineDays(parsedDays.map((day) => day.metrics)),
    daily: parsedDays.map((day) => ({
      date: day.date,
      metrics: scalarMetrics(day.metrics),
    })),
    dimension,
    breakdown,
  };
}

export const ClarityService = {
  connect,
  disconnect,
  getStatus,
  getInsights,
  runDailySnapshots,
};
