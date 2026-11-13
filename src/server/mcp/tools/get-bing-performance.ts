import { z } from "zod";
import { BingService } from "@/server/features/bing/BingService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

// Fork (Bing Webmaster Tools).
const inputSchema = { projectId: projectIdSchema } as const;
type Args = z.infer<z.ZodObject<typeof inputSchema>>;

const topRowSchema = z.looseObject({
  clicks: z.number(),
  impressions: z.number(),
  position: z.number().nullable(),
});

export const getBingPerformanceTool = {
  name: "get_bing_performance",
  config: {
    title: "Get Bing Webmaster Tools performance",
    description:
      "Get Bing Webmaster Tools data for the project's connected Bing site: clicks and impressions for the last 28 days against the 28 days before, the daily trend, the top 10 queries and pages by impressions, and the latest crawl snapshot (crawled pages, pages in index, crawl errors). Dates are UTC days. processing is true while Bing has no data for the site yet. The Bing API key is added per project in Settings → Integrations. Reads only; uses no credits.",
    inputSchema,
    outputSchema: z.looseObject({
      connected: z.boolean(),
      siteUrl: z.string().optional(),
      processing: z.boolean().optional(),
      invalidKey: z.boolean().optional(),
      errors: z.array(z.string()).optional(),
      totals: z
        .looseObject({ clicks: z.number(), impressions: z.number() })
        .optional(),
      prevTotals: z
        .looseObject({ clicks: z.number(), impressions: z.number() })
        .optional(),
      topQueries: z
        .array(topRowSchema.extend({ query: z.string() }))
        .optional(),
      topPages: z.array(topRowSchema.extend({ page: z.string() })).optional(),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const report = await BingService.getReport(args.projectId);
    const meta = buildProjectMeta(
      context,
      args.projectId,
      report.connected
        ? `/p/${args.projectId}/bing`
        : `/p/${args.projectId}/settings/integrations#bing`,
    );
    if (!report.connected) {
      return mcpResponse({
        text: "Bing Webmaster Tools is not connected for this project. Add a Bing API key in Settings → Integrations.",
        meta,
        structuredContent: { connected: false },
      });
    }
    const lines = [
      `Bing site: ${report.siteUrl} (${report.range.start} to ${report.range.end})`,
      report.invalidKey
        ? "Bing rejected the stored API key. Replace it in Settings → Integrations."
        : report.processing
          ? "Bing is still processing this site; no data yet."
          : `Clicks ${report.totals.clicks} (previous 28 days ${report.prevTotals.clicks}), impressions ${report.totals.impressions} (previous ${report.prevTotals.impressions}).`,
      ...report.topQueries.map(
        (row) =>
          `Query "${row.query}": ${row.clicks} clicks, ${row.impressions} impressions${row.position === null ? "" : `, position ${row.position}`}`,
      ),
      ...report.topPages.map(
        (row) =>
          `Page ${row.page}: ${row.clicks} clicks, ${row.impressions} impressions`,
      ),
      ...(report.crawl
        ? [
            `Crawl ${report.crawl.date}: ${report.crawl.crawledPages ?? "?"} crawled, ${report.crawl.inIndex ?? "?"} in index, ${report.crawl.crawlErrors ?? 0} errors`,
          ]
        : []),
      ...report.errors,
    ];
    return mcpResponse({
      text: lines.join("\n"),
      meta,
      structuredContent: report,
    });
  }),
};
