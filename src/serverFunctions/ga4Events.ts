import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Ga4ReportingService } from "@/server/features/ga4/services/Ga4ReportingService";
import { AppError } from "@/server/lib/errors";
import { Ga4ReportError } from "@/server/lib/ga4Errors";
import { requireProjectContext } from "@/serverFunctions/middleware";

// Fork (all GA4 events): the dashboard card and the GA4 Events page.
const schema = z.object({
  projectId: z.string().min(1),
  breakdown: z
    .enum(["event", "event_and_page", "event_and_param", "event_and_source"])
    .default("event"),
  eventParameter: z.string().trim().max(40).optional(),
  channel: z.enum(["organic_search", "all"]).default("all"),
});

export const getGa4EventsReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(schema)
  .handler(async ({ data, context }) => {
    try {
      const result = await Ga4ReportingService.runReport({
        projectId: context.projectId,
        kind: "events",
        eventBreakdown: data.breakdown,
        eventParameter: data.eventParameter,
        channel: data.channel,
        limit: 200,
        comparePreviousPeriod: data.breakdown === "event",
      });
      return {
        status: "ok" as const,
        range: result.request.resolvedDateRange,
        dimensions: result.request.dimensions,
        rows: result.rows,
        previous: Object.fromEntries(
          (result.comparison?.rows ?? []).map((row) => [
            String(row.dimensions.eventName ?? ""),
            row.metrics.eventCount?.previous ?? null,
          ]),
        ),
      };
    } catch (error) {
      if (error instanceof Ga4ReportError) {
        if (error.code === "ga4_quota_exhausted") {
          throw new AppError("RATE_LIMITED");
        }
        return {
          status: "error" as const,
          code: error.code,
          message: error.message,
        };
      }
      throw error;
    }
  });
