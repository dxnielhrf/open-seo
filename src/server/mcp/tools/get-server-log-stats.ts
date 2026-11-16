import { z } from "zod";
import { ServerLogService } from "@/server/features/server-logs/ServerLogService";
import {
  SERVER_LOG_BOTS,
  SERVER_LOG_BREAKDOWNS,
  SERVER_LOG_STATUS_FILTERS,
} from "@/server/features/server-logs/serverLogBots";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

// Fork (server logs).
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const inputSchema = {
  projectId: projectIdSchema,
  startDate: dateSchema.optional().describe("Inclusive YYYY-MM-DD. Default: 7 days ago."),
  endDate: dateSchema.optional().describe("Inclusive YYYY-MM-DD. Default: yesterday."),
  breakdown: z.enum(SERVER_LOG_BREAKDOWNS).optional().describe("Default bot."),
  bots: z
    .union([z.literal("ai"), z.array(z.enum(SERVER_LOG_BOTS))])
    .optional()
    .describe('Only these bot classes, or "ai" for all AI crawlers and fetchers.'),
  status: z.enum(SERVER_LOG_STATUS_FILTERS).optional().describe("Default all."),
  limit: z.number().int().min(1).max(1000).optional(),
} as const;
type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const getServerLogStatsTool = {
  name: "get_server_log_stats",
  config: {
    title: "Get server log stats",
    description:
      "Get daily web server access-log totals for the project's site: hits by bot class (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, PerplexityBot, Perplexity-User, Google-Extended, Googlebot, Bingbot, other bots, people), path (without query string) and HTTP status. Breakdown by bot, path, status, bot_and_path or date. Use bots=\"ai\" with breakdown=bot_and_path to see which pages AI crawlers fetch, and status=errors|4xx|5xx for broken URLs. Google-Extended is only a robots.txt token, so it never appears in logs; Google's AI training uses Googlebot fetches. No IPs, user agents or referrers are stored. Data arrives once a day from the log script; set it up in Settings → Integrations. Reads only; uses no credits.",
    inputSchema,
    outputSchema: z.looseObject({
      connected: z.boolean(),
      rows: z.array(z.record(z.string(), z.unknown())).optional(),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const stats = await ServerLogService.getStats({
      projectId: args.projectId,
      startDate: args.startDate,
      endDate: args.endDate,
      breakdown: args.breakdown ?? "bot",
      bots: args.bots,
      status: args.status,
      limit: args.limit,
    });
    const meta = buildProjectMeta(
      context,
      args.projectId,
      stats.connected
        ? `/p/${args.projectId}/server-logs`
        : `/p/${args.projectId}/settings/integrations#server-logs`,
    );
    if (!stats.connected) {
      return mcpResponse({
        text: "Server logs are not connected for this project. Create an ingest token in Settings → Integrations and run the log script.",
        meta,
        structuredContent: { connected: false },
      });
    }
    const lines = [
      `Server logs ${stats.range.startDate} to ${stats.range.endDate} by ${stats.breakdown} (last day received: ${stats.lastIngestDate ?? "none"}):`,
      ...stats.rows.map((row) =>
        [row.date, row.bot, row.path, row.status, `${row.hits} hits`]
          .filter((v) => v !== undefined)
          .join(" · "),
      ),
    ];
    return mcpResponse({
      text: lines.join("\n"),
      meta,
      structuredContent: stats,
    });
  }),
};
