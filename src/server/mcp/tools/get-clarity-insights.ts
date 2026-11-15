import { z } from "zod";
import { ClarityService } from "@/server/features/clarity/ClarityService";
import { CLARITY_DIMENSIONS } from "@/server/lib/clarityClient";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

// Fork (Microsoft Clarity).
const inputSchema = {
  projectId: projectIdSchema,
  days: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe("Days of stored daily snapshots to include. Default 7."),
  dimension: z
    .enum(CLARITY_DIMENSIONS)
    .optional()
    .describe("Also return a breakdown by URL, Source or Device."),
} as const;
type Args = z.infer<z.ZodObject<typeof inputSchema>>;

const rowsSchema = z.record(
  z.string(),
  z.array(z.record(z.string(), z.union([z.number(), z.string()]))),
);

const describeRows = (rows: Record<string, number | string>[]) =>
  rows
    .map((row) =>
      Object.entries(row)
        .map(([k, v]) => `${k}=${v}`)
        .join(", "),
    )
    .join(" | ");

export const getClarityInsightsTool = {
  name: "get_clarity_insights",
  config: {
    title: "Get Microsoft Clarity insights",
    description:
      "Get Microsoft Clarity behaviour data for the project's connected Clarity project, read from daily snapshots OpenSEO stores (Clarity's API only serves the last 3 days). Returns, per Clarity metric (Traffic: sessions, bot sessions, distinct users, pages per session; Scroll Depth; Engagement Time; Dead, Rage, Quickback and Error clicks; Script Errors; Excessive Scroll; Popular Pages; Referrer URL; …), the values over the range: counts summed, rates, averages and times averaged across days. Also a daily series of the site-wide metrics, and with `dimension` a top-15 breakdown by URL, Source or Device. Each snapshot covers the 24 hours before it was taken (daily at 03:17 UTC). The Clarity token is added per project in Settings → Integrations. Reads only; uses no credits.",
    inputSchema,
    outputSchema: z.looseObject({
      connected: z.boolean(),
      snapshotDays: z.number().optional(),
      lastSnapshotAt: z.string().nullable().optional(),
      lastError: z.string().nullable().optional(),
      totals: rowsSchema.optional(),
      breakdown: rowsSchema.nullable().optional(),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const insights = await ClarityService.getInsights(
      args.projectId,
      args.days ?? 7,
      args.dimension ?? null,
    );
    const meta = buildProjectMeta(
      context,
      args.projectId,
      insights.connected
        ? `/p/${args.projectId}/clarity`
        : `/p/${args.projectId}/settings/integrations#clarity`,
    );
    if (!insights.connected) {
      return mcpResponse({
        text: "Microsoft Clarity is not connected for this project. Add a Clarity Data Export token in Settings → Integrations.",
        meta,
        structuredContent: { connected: false },
      });
    }
    const lines = [
      `Clarity${insights.clarityProjectId ? ` project ${insights.clarityProjectId}` : ""}: ${insights.snapshotDays} daily snapshot(s) from ${insights.range.start} to ${insights.range.end}. Last snapshot ${insights.lastSnapshotAt ?? "never"}.`,
      ...(insights.lastError
        ? [`Last snapshot problem: ${insights.lastError}`]
        : []),
      ...Object.entries(insights.totals).map(
        ([metric, rows]) => `${metric}: ${describeRows(rows)}`,
      ),
      ...(insights.breakdown
        ? [
            `By ${insights.dimension}:`,
            ...Object.entries(insights.breakdown).map(
              ([metric, rows]) => `${metric}: ${describeRows(rows)}`,
            ),
          ]
        : []),
    ];
    return mcpResponse({
      text: lines.join("\n"),
      meta,
      structuredContent: insights,
    });
  }),
};
