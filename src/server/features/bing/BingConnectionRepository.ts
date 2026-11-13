import { count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bingConnections } from "@/db/schema";

// Fork (Bing Webmaster Tools).
type BingConnection = typeof bingConnections.$inferSelect;

async function getByProjectId(
  projectId: string,
): Promise<BingConnection | null> {
  const rows = await db
    .select()
    .from(bingConnections)
    .where(eq(bingConnections.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function upsert(input: {
  projectId: string;
  organizationId: string;
  siteUrl: string;
  encryptedApiKey: string;
  connectedByUserId: string;
}): Promise<BingConnection> {
  const [row] = await db
    .insert(bingConnections)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoUpdate({
      target: bingConnections.projectId,
      set: {
        organizationId: input.organizationId,
        siteUrl: input.siteUrl,
        encryptedApiKey: input.encryptedApiKey,
        connectedByUserId: input.connectedByUserId,
        updatedAt: sql`(current_timestamp)`,
      },
    })
    .returning();
  if (!row) throw new Error("Failed to upsert bing_connection");
  return row;
}

async function deleteByProjectId(projectId: string): Promise<void> {
  await db
    .delete(bingConnections)
    .where(eq(bingConnections.projectId, projectId));
}

async function countAll(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(bingConnections);
  return row?.value ?? 0;
}

export const BingConnectionRepository = {
  getByProjectId,
  upsert,
  deleteByProjectId,
  countAll,
};
