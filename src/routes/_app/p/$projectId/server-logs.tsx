import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CardShell } from "@/client/components/CardShell";
import { Button } from "@/client/components/ui/button";
import { StatsTable } from "@/client/features/server-logs/AiCrawlerCard";
import { serverLogStatsOptions } from "@/client/features/server-logs/serverLogQueries";
import { pageHead } from "@/client/lib/pageHead";
import { queryClient } from "@/client/tanstack-db/queryClient";
import type {
  ServerLogBreakdown,
  ServerLogStatusFilter,
} from "@/server/features/server-logs/serverLogBots";

// Fork (server logs).
const BREAKDOWNS: { value: ServerLogBreakdown; label: string }[] = [
  { value: "bot_and_path", label: "Bot + page" },
  { value: "bot", label: "Bot" },
  { value: "path", label: "Page" },
  { value: "status", label: "Status" },
  { value: "date", label: "Day" },
];
const STATUSES: ServerLogStatusFilter[] = ["all", "errors", "4xx", "5xx"];
const COLUMNS = {
  bot_and_path: ["bot", "path"],
  bot: ["bot"],
  path: ["path"],
  status: ["status"],
  date: ["date"],
} as const;

export const Route = createFileRoute("/_app/p/$projectId/server-logs")({
  head: () => pageHead("Server Logs"),
  loader: ({ params }) => {
    void queryClient.prefetchQuery(
      serverLogStatsOptions(params.projectId, 7, "bot_and_path", true, "all"),
    );
  },
  component: ServerLogsRoute,
});

function ServerLogsRoute() {
  const { projectId } = Route.useParams();
  const [days, setDays] = useState(7);
  const [breakdown, setBreakdown] = useState<ServerLogBreakdown>("bot_and_path");
  const [aiOnly, setAiOnly] = useState(true);
  const [status, setStatus] = useState<ServerLogStatusFilter>("all");
  const query = useQuery(
    serverLogStatsOptions(projectId, days, breakdown, aiOnly, status),
  );
  const data = query.data;
  return (
    <div className="px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold">Server Logs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data?.connected
              ? `${data.range.startDate} to ${data.range.endDate} · last day received ${data.lastIngestDate ?? "none"} · daily totals only, no IPs or user agents`
              : "Access-log totals per day: AI crawlers, search bots, people, errors."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {BREAKDOWNS.map((b) => (
            <Button
              key={b.value}
              size="sm"
              variant={b.value === breakdown ? "default" : "outline"}
              onClick={() => setBreakdown(b.value)}
            >
              {b.label}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => setAiOnly(!aiOnly)}>
            {aiOnly ? "AI crawlers only" : "All visitors"}
          </Button>
          {STATUSES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={s === status ? "default" : "outline"}
              onClick={() => setStatus(s)}
            >
              {s}
            </Button>
          ))}
          {[7, 28, 90].map((d) => (
            <Button
              key={d}
              size="sm"
              variant={d === days ? "default" : "outline"}
              onClick={() => setDays(d)}
            >
              {d} days
            </Button>
          ))}
        </div>
        <CardShell title="Hits">
          {query.isError ? (
            <p className="text-sm text-muted-foreground">
              Couldn&rsquo;t load server log data.
            </p>
          ) : !data ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !data.connected ? (
            <p className="text-sm text-muted-foreground">
              Create an ingest token in Settings → Integrations and run the log
              script.
            </p>
          ) : (
            <StatsTable
              rows={data.rows}
              columns={[...COLUMNS[breakdown]]}
              empty="No hits for this selection."
            />
          )}
        </CardShell>
      </div>
    </div>
  );
}
