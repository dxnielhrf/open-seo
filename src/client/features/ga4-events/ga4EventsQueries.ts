import { queryOptions } from "@tanstack/react-query";
import type { Ga4EventBreakdown } from "@/server/features/ga4/services/Ga4ReportDefinitions";
import { getGa4EventsReport } from "@/serverFunctions/ga4Events";

// Fork (all GA4 events). Kept chart-free: route loaders import it.
export const ga4EventsOptions = (
  projectId: string,
  breakdown: Ga4EventBreakdown = "event",
  eventParameter?: string,
  channel: "all" | "organic_search" = "all",
) =>
  queryOptions({
    queryKey: ["ga4Events", projectId, breakdown, eventParameter, channel],
    queryFn: () =>
      getGa4EventsReport({
        data: { projectId, breakdown, eventParameter, channel },
      }),
    staleTime: 10 * 60_000,
  });
