import { and, desc, eq, gte, inArray, lte, sql, sum } from "drizzle-orm";
import { chunk } from "remeda";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import { serverLogDaily, serverLogSources } from "@/db/schema";
import type {
  ServerLogBot,
  ServerLogBreakdown,
  ServerLogStatusFilter,
} from "@/server/features/server-logs/serverLogBots";

// Fork (server logs).
type Source = typeof serverLogSources.$inferSelect;

async function getSource(projectId: string): Promise<Source | null> {
  const rows = await db
    .select()
    .from(serverLogSources)
    .where(eq(serverLogSources.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function getSourceByTokenHash(tokenHash: string): Promise<Source | null> {
  const rows = await db
    .select()
    .from(serverLogSources)
    .where(eq(serverLogSources.tokenHash, tokenHash))
    .limit(1);
  return rows[0] ?? null;
}

async function setToken(projectId: string, tokenHash: string): Promise<void> {
  await db
    .insert(serverLogSources)
    .values({ id: crypto.randomUUID(), projectId, tokenHash })
    .onConflictDoUpdate({
      target: serverLogSources.projectId,
      set: { tokenHash },
    });
}

async function deleteSource(projectId: string): Promise<void> {
  await db
    .delete(serverLogSources)
    .where(eq(serverLogSources.projectId, projectId));
}

async function countAll(): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)` })
    .from(serverLogSources);
  return Number(row?.value ?? 0);
}

/** Replaces one day's rows, so re-sending a day never double counts. */
async function replaceDay(input: {
  projectId: string;
  date: string;
  rows: { path: string; status: number; bot: ServerLogBot; hits: number }[];
}): Promise<void> {
  const values = input.rows.map((row) => ({
    id: crypto.randomUUID(),
    projectId: input.projectId,
    date: input.date,
    ...row,
  }));
  await runBatch((tx) => [
    tx
      .delete(serverLogDaily)
      .where(
        and(
          eq(serverLogDaily.projectId, input.projectId),
          eq(serverLogDaily.date, input.date),
        ),
      ),
    // D1 allows 100 bound parameters per statement: 7 columns per row.
    ...chunk(values, 14).map((rows) => tx.insert(serverLogDaily).values(rows)),
    tx
      .update(serverLogSources)
      .set({
        lastIngestAt: new Date().toISOString(),
        lastIngestDate: input.date,
      })
      .where(eq(serverLogSources.projectId, input.projectId)),
  ]);
}

const GROUP_COLUMNS = {
  bot: [serverLogDaily.bot],
  path: [serverLogDaily.path],
  status: [serverLogDaily.status],
  bot_and_path: [serverLogDaily.bot, serverLogDaily.path],
  date: [serverLogDaily.date],
} as const;

async function aggregate(input: {
  projectId: string;
  startDate: string;
  endDate: string;
  breakdown: ServerLogBreakdown;
  bots?: readonly ServerLogBot[];
  status: ServerLogStatusFilter;
  limit: number;
}) {
  const statusCondition = {
    all: undefined,
    errors: gte(serverLogDaily.status, 400),
    "4xx": and(gte(serverLogDaily.status, 400), lte(serverLogDaily.status, 499)),
    "5xx": gte(serverLogDaily.status, 500),
  }[input.status];
  const columns = GROUP_COLUMNS[input.breakdown];
  const hits = sum(serverLogDaily.hits).mapWith(Number);
  return db
    .select({
      bot: serverLogDaily.bot,
      path: serverLogDaily.path,
      status: serverLogDaily.status,
      date: serverLogDaily.date,
      hits,
    })
    .from(serverLogDaily)
    .where(
      and(
        eq(serverLogDaily.projectId, input.projectId),
        gte(serverLogDaily.date, input.startDate),
        lte(serverLogDaily.date, input.endDate),
        input.bots?.length
          ? inArray(serverLogDaily.bot, [...input.bots])
          : undefined,
        statusCondition,
      ),
    )
    .groupBy(...columns)
    .orderBy(input.breakdown === "date" ? serverLogDaily.date : desc(hits))
    .limit(input.limit);
}

export const ServerLogRepository = {
  getSource,
  getSourceByTokenHash,
  setToken,
  deleteSource,
  countAll,
  replaceDay,
  aggregate,
};
