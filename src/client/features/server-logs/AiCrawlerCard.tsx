import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CardShell } from "@/client/components/CardShell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import {
  cardMetaClass,
  cardTableClass,
  moreDetailsClass,
} from "@/client/features/dashboard/cardParts";
import { MetricsSkeleton } from "@/client/features/dashboard/DashboardMetrics";
import { aiCrawlerSummaryOptions } from "@/client/features/server-logs/serverLogQueries";
import { formatCount } from "@/client/features/search-performance/SearchPerformanceColumns";
import { AI_BOTS } from "@/server/features/server-logs/serverLogBots";
import type { ServerLogStatsRow } from "@/server/features/server-logs/ServerLogService";

// Fork (server logs): the "AI-Crawler" dashboard card.
export function AiCrawlerCard({ projectId }: { projectId: string }) {
  const query = useQuery(aiCrawlerSummaryOptions(projectId));
  const data = query.data;
  if (data && !data.connected) return null; // nothing set up: no card
  const aiRows = (data?.byBot ?? []).filter((row) =>
    (AI_BOTS as readonly string[]).includes(row.bot ?? ""),
  );
  const errorHits = (data?.errors ?? []).reduce((a, r) => a + r.hits, 0);
  const serverErrors = (data?.errors ?? [])
    .filter((r) => (r.status ?? 0) >= 500)
    .reduce((a, r) => a + r.hits, 0);
  return (
    <CardShell
      title="AI-Crawler"
      titleInfo={<span className={cardMetaClass}>Last 7 days, server logs</span>}
      action={
        <Link
          to="/p/$projectId/server-logs"
          params={{ projectId }}
          className={moreDetailsClass}
        >
          More details
        </Link>
      }
    >
      {query.isError ? (
        <p className="text-sm text-muted-foreground">
          Couldn&rsquo;t load server log data.
        </p>
      ) : !data ? (
        <MetricsSkeleton />
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">
            {aiRows.length === 0
              ? "No AI crawler visits in the last 7 days."
              : aiRows.map((r) => `${r.bot} ${formatCount(r.hits)}`).join(" · ")}
          </p>
          <StatsTable
            rows={data.topAiPaths}
            columns={["bot", "path"]}
            empty="No pages fetched by AI crawlers yet."
          />
          <p className="text-muted-foreground">
            Errors: {formatCount(errorHits)} hits with 4xx/5xx
            {serverErrors ? `, ${formatCount(serverErrors)} of them 5xx` : ""}.
            Last day received: {data.lastIngestDate ?? "none yet"}.
          </p>
        </div>
      )}
    </CardShell>
  );
}

export function StatsTable({
  rows,
  columns,
  empty,
}: {
  rows: ServerLogStatsRow[];
  columns: (keyof ServerLogStatsRow)[];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <Table className={cardTableClass}>
      <TableHeader>
        <TableRow>
          {columns.map((c) => (
            <TableHead key={c}>{c}</TableHead>
          ))}
          <TableHead className="text-right">Hits</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={columns.map((c) => String(row[c])).join("|")}>
            {columns.map((c) => (
              <TableCell key={c} className="max-w-0 truncate">
                {String(row[c] ?? "")}
              </TableCell>
            ))}
            <TableCell className="text-right">{formatCount(row.hits)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
