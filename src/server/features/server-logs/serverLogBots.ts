// Fork (server logs): the bot classes the ingest script assigns. The same list
// lives in scripts/fork/server-logs.py; keep both in step.
export const SERVER_LOG_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Googlebot",
  "Bingbot",
  "other bots",
  "people",
] as const;
export type ServerLogBot = (typeof SERVER_LOG_BOTS)[number];

/** Crawlers and fetchers of AI assistants (Googlebot and Bingbot excluded). */
export const AI_BOTS: readonly ServerLogBot[] = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
];

export const SERVER_LOG_BREAKDOWNS = [
  "bot",
  "path",
  "status",
  "bot_and_path",
  "date",
] as const;
export type ServerLogBreakdown = (typeof SERVER_LOG_BREAKDOWNS)[number];

export const SERVER_LOG_STATUS_FILTERS = ["all", "errors", "4xx", "5xx"] as const;
export type ServerLogStatusFilter = (typeof SERVER_LOG_STATUS_FILTERS)[number];
