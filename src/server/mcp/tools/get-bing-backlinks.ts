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

export const getBingBacklinksTool = {
  name: "get_bing_backlinks",
  config: {
    title: "Get Bing inbound links",
    description:
      "Get the inbound links Bing Webmaster Tools knows of for the project's connected Bing site: the site's pages with their inbound link counts, the referring domains, and for the 10 most linked pages the linking URLs with anchor text. First-party Bing data, often incomplete for small sites; empty lists mean Bing reports no links yet. Reads only; uses no credits. For DataForSEO's backlink index use get_backlinks_profile.",
    inputSchema,
    outputSchema: z.looseObject({
      connected: z.boolean(),
      siteUrl: z.string().optional(),
      invalidKey: z.boolean().optional(),
      errors: z.array(z.string()).optional(),
      totalLinks: z.number().optional(),
      targets: z
        .array(z.looseObject({ url: z.string(), count: z.number() }))
        .optional(),
      domains: z
        .array(z.looseObject({ domain: z.string(), links: z.number() }))
        .optional(),
      links: z
        .array(
          z.looseObject({
            source: z.string(),
            target: z.string(),
            anchorText: z.string().nullable(),
          }),
        )
        .optional(),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const result = await BingService.getBacklinks(args.projectId);
    const meta = buildProjectMeta(
      context,
      args.projectId,
      result.connected
        ? `/p/${args.projectId}/bing`
        : `/p/${args.projectId}/settings/integrations#bing`,
    );
    if (!result.connected) {
      return mcpResponse({
        text: "Bing Webmaster Tools is not connected for this project. Add a Bing API key in Settings → Integrations.",
        meta,
        structuredContent: { connected: false },
      });
    }
    const lines = [
      `Bing site: ${result.siteUrl}`,
      result.invalidKey
        ? "Bing rejected the stored API key. Replace it in Settings → Integrations."
        : `${result.totalLinks} inbound links to ${result.targets.length} pages from ${result.domains.length} referring domains (as far as Bing reports).`,
      ...result.domains.map(
        (row) => `Domain ${row.domain}: ${row.links} links`,
      ),
      ...result.links.map(
        (row) =>
          `${row.source} → ${row.target}${row.anchorText ? ` ("${row.anchorText}")` : ""}`,
      ),
      ...result.errors,
    ];
    return mcpResponse({
      text: lines.join("\n"),
      meta,
      structuredContent: result,
    });
  }),
};
