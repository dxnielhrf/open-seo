import {
  sqliteTable,
  text,
  uniqueIndex,
  index,
  integer,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { organization } from "./better-auth-schema";
import { projects } from "./app.schema";

// Connected Google Search Console property per project.
// OAuth tokens live in the better-auth `account` table under providerId
// "google-search-console"; this row only records which verified property maps
// to a project and whose grant to use when calling the GSC API.
export const gscConnections = sqliteTable(
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
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // One selected property per project in v1; switching replaces the row.
    uniqueIndex("gsc_connections_project_idx").on(table.projectId),
    index("gsc_connections_organization_idx").on(table.organizationId),
  ],
);

// Fork (Bing Webmaster Tools): one Bing site per project. The API key is
// encrypted with BETTER_AUTH_SECRET and never returned to the client.
export const bingConnections = sqliteTable(
  "bing_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // As GetUserSites returns it, e.g. "https://example.com/".
    siteUrl: text("site_url").notNull(),
    encryptedApiKey: text("encrypted_api_key").notNull(),
    connectedByUserId: text("connected_by_user_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [uniqueIndex("bing_connections_project_idx").on(table.projectId)],
);

// Fork (Microsoft Clarity): one Clarity project per OpenSEO project. The Data
// Export token is encrypted with BETTER_AUTH_SECRET and never returned to the
// client. Clarity only serves the last 1-3 days, so a daily cron stores
// snapshots in clarity_snapshots.
export const clarityConnections = sqliteTable(
  "clarity_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Label only (the token is already scoped to one Clarity project).
    clarityProjectId: text("clarity_project_id"),
    encryptedToken: text("encrypted_token").notNull(),
    connectedByUserId: text("connected_by_user_id").notNull(),
    lastSnapshotAt: text("last_snapshot_at"),
    lastError: text("last_error"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("clarity_connections_project_idx").on(table.projectId),
  ],
);

// One row per project, UTC fetch day and dimension ("" = site totals). `data`
// is Clarity's raw JSON answer for the 24 hours before `fetched_at`.
export const claritySnapshots = sqliteTable(
  "clarity_snapshots",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    snapshotDate: text("snapshot_date").notNull(),
    dimension: text("dimension").notNull(),
    data: text("data").notNull(),
    fetchedAt: text("fetched_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("clarity_snapshots_day_idx").on(
      table.projectId,
      table.snapshotDate,
      table.dimension,
    ),
  ],
);

// Fork (server logs): one ingest token per project (SHA-256 hash only) for the
// script that aggregates the web server's access logs and posts daily totals.
export const serverLogSources = sqliteTable(
  "server_log_sources",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    lastIngestAt: text("last_ingest_at"),
    lastIngestDate: text("last_ingest_date"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("server_log_sources_project_idx").on(table.projectId),
    uniqueIndex("server_log_sources_token_idx").on(table.tokenHash),
  ],
);

// Daily hits per path, status and bot class. No IPs, user agents or referrers.
export const serverLogDaily = sqliteTable(
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
