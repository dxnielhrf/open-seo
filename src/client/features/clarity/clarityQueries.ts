import { queryOptions } from "@tanstack/react-query";
import {
  getClarityConnection,
  getClarityInsights,
} from "@/serverFunctions/clarity";
import type { ClarityDimension } from "@/server/lib/clarityClient";

// Fork (Microsoft Clarity). Reads stored snapshots only; no Clarity calls.
export const clarityConnectionOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["clarityConnection", projectId],
    queryFn: () => getClarityConnection({ data: { projectId } }),
  });

export const clarityInsightsOptions = (
  projectId: string,
  days: number,
  dimension: ClarityDimension | null = null,
) =>
  queryOptions({
    queryKey: ["clarityInsights", projectId, days, dimension],
    queryFn: () =>
      getClarityInsights({ data: { projectId, days, dimension } }),
    staleTime: 10 * 60_000,
  });
