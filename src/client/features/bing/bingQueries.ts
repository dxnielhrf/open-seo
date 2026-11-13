import { queryOptions } from "@tanstack/react-query";
import {
  getBingBacklinks,
  getBingConnection,
  getBingReport,
} from "@/serverFunctions/bing";

// Fork (Bing Webmaster Tools).
export const bingConnectionOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["bingConnection", projectId],
    queryFn: () => getBingConnection({ data: { projectId } }),
  });

// Bing updates its numbers about daily; four API calls per load is plenty.
export const bingReportOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["bingReport", projectId],
    queryFn: () => getBingReport({ data: { projectId } }),
    staleTime: 10 * 60_000,
  });

// Up to 11 Bing calls per load; links change slowly.
export const bingBacklinksOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["bingBacklinks", projectId],
    queryFn: () => getBingBacklinks({ data: { projectId } }),
    staleTime: 30 * 60_000,
  });
