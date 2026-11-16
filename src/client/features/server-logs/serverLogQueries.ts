import { queryOptions } from "@tanstack/react-query";
import {
  getAiCrawlerSummary,
  getServerLogSource,
  getServerLogStats,
} from "@/serverFunctions/serverLogs";
import type {
  ServerLogBreakdown,
  ServerLogStatusFilter,
} from "@/server/features/server-logs/serverLogBots";

// Fork (server logs). Chart-free: route loaders import it.
export const serverLogSourceOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["serverLogSource", projectId],
    queryFn: () => getServerLogSource({ data: { projectId } }),
  });

export const aiCrawlerSummaryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["serverLogStats", projectId, "summary"],
    queryFn: () => getAiCrawlerSummary({ data: { projectId } }),
    staleTime: 10 * 60_000,
  });

export const serverLogStatsOptions = (
  projectId: string,
  days: number,
  breakdown: ServerLogBreakdown,
  aiOnly: boolean,
  status: ServerLogStatusFilter,
) =>
  queryOptions({
    queryKey: ["serverLogStats", projectId, days, breakdown, aiOnly, status],
    queryFn: () =>
      getServerLogStats({
        data: {
          projectId,
          days,
          breakdown,
          bots: aiOnly ? "ai" : undefined,
          status,
        },
      }),
    staleTime: 10 * 60_000,
  });
