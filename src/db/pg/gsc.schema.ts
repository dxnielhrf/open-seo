import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./better-auth-schema";
import { projects } from "./app.schema";

// See src/db/pg/app.schema.ts for why timestamps are ISO-8601 UTC text.
const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// Connected Google Search Console property per project.
// OAuth tokens live in the better-auth `account` table under providerId
// "google-search-console"; this row only records which verified property maps
// to a project and whose grant to use when calling the GSC API.
export const gscConnections = pgTable(
  "gsc_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Stored verbatim from sites.list — "sc-domain:example.com" or
    // "https://example.com/". Never normalize; GSC matches it byte-for-byte.
    siteUrl: text("site_url").notNull(),
    // Whose google-search-console grant getAccessToken should use.
    connectedByUserId: text("connected_by_user_id").notNull(),
    gscAccountId: text("gsc_account_id"),
    connectedAccountEmail: text("connected_account_email"),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    // One selected property per project in v1; switching replaces the row.
    uniqueIndex("gsc_connections_project_idx").on(table.projectId),
    index("gsc_connections_organization_idx").on(table.organizationId),
  ],
);

// Fork (Bing Webmaster Tools): see src/db/gsc.schema.ts.
export const bingConnections = pgTable(
  "bing_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    siteUrl: text("site_url").notNull(),
    encryptedApiKey: text("encrypted_api_key").notNull(),
    connectedByUserId: text("connected_by_user_id").notNull(),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [uniqueIndex("bing_connections_project_idx").on(table.projectId)],
);

// Fork (Microsoft Clarity): see src/db/gsc.schema.ts.
export const clarityConnections = pgTable(
  "clarity_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clarityProjectId: text("clarity_project_id"),
    encryptedToken: text("encrypted_token").notNull(),
    connectedByUserId: text("connected_by_user_id").notNull(),
    lastSnapshotAt: text("last_snapshot_at"),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("clarity_connections_project_idx").on(table.projectId),
  ],
);

export const claritySnapshots = pgTable(
  "clarity_snapshots",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    snapshotDate: text("snapshot_date").notNull(),
    dimension: text("dimension").notNull(),
    data: text("data").notNull(),
    fetchedAt: text("fetched_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("clarity_snapshots_day_idx").on(
      table.projectId,
      table.snapshotDate,
      table.dimension,
    ),
  ],
);

// Fork (server logs): see src/db/gsc.schema.ts.
export const serverLogSources = pgTable(
  "server_log_sources",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    lastIngestAt: text("last_ingest_at"),
    lastIngestDate: text("last_ingest_date"),
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("server_log_sources_project_idx").on(table.projectId),
    uniqueIndex("server_log_sources_token_idx").on(table.tokenHash),
  ],
);

export const serverLogDaily = pgTable(
  "server_log_daily",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    path: text("path").notNull(),
    status: integer("status").notNull(),
    bot: text("bot").notNull(),
    hits: integer("hits").notNull(),
  },
  (table) => [
    uniqueIndex("server_log_daily_row_idx").on(
      table.projectId,
      table.date,
      table.path,
      table.status,
      table.bot,
    ),
  ],
);
