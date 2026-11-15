import { and, asc, count, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { clarityConnections, claritySnapshots } from "@/db/schema";

// Fork (Microsoft Clarity).
type ClarityConnection = typeof clarityConnections.$inferSelect;
type ClaritySnapshot = typeof claritySnapshots.$inferSelect;

async function getByProjectId(
  projectId: string,
): Promise<ClarityConnection | null> {
  const rows = await db
    .select()
    .from(clarityConnections)
    .where(eq(clarityConnections.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function listAll(): Promise<ClarityConnection[]> {
  return db.select().from(clarityConnections);
}

async function upsert(input: {
  projectId: string;
  organizationId: string;
  clarityProjectId: string | null;
  encryptedToken: string;
  connectedByUserId: string;
}): Promise<void> {
  await db
    .insert(clarityConnections)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoUpdate({
      target: clarityConnections.projectId,
      set: {
        organizationId: input.organizationId,
        clarityProjectId: input.clarityProjectId,
        encryptedToken: input.encryptedToken,
        connectedByUserId: input.connectedByUserId,
        lastError: null,
        updatedAt: sql`(current_timestamp)`,
      },
    });
}

async function setSnapshotResult(
  projectId: string,
  result: { at: string; error: string | null },
): Promise<void> {
  await db
    .update(clarityConnections)
    .set({
      lastError: result.error,
      ...(result.error ? {} : { lastSnapshotAt: result.at }),
    })
    .where(eq(clarityConnections.projectId, projectId));
}

async function deleteByProjectId(projectId: string): Promise<void> {
  await db
    .delete(clarityConnections)
    .where(eq(clarityConnections.projectId, projectId));
}

async function countAll(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(clarityConnections);
  return row?.value ?? 0;
}

async function saveSnapshot(input: {
  projectId: string;
  snapshotDate: string;
  dimension: string;
  data: string;
  fetchedAt: string;
}): Promise<void> {
  await db
    .insert(claritySnapshots)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoUpdate({
      target: [
        claritySnapshots.projectId,
        claritySnapshots.snapshotDate,
        claritySnapshots.dimension,
      ],
      set: { data: input.data, fetchedAt: input.fetchedAt },
    });
}

async function listSnapshots(
  projectId: string,
  dimension: string,
  sinceDate: string,
): Promise<ClaritySnapshot[]> {
  return db
    .select()
    .from(claritySnapshots)
    .where(
      and(
        eq(claritySnapshots.projectId, projectId),
        eq(claritySnapshots.dimension, dimension),
        gte(claritySnapshots.snapshotDate, sinceDate),
      ),
    )
    .orderBy(asc(claritySnapshots.snapshotDate));
}

export const ClarityRepository = {
  getByProjectId,
  listAll,
  upsert,
  setSnapshotResult,
  deleteByProjectId,
  countAll,
  saveSnapshot,
  listSnapshots,
};
