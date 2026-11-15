import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CardShell } from "@/client/components/CardShell";
import { percentChange } from "@/client/components/MetricsTable";
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
import { formatCount } from "@/client/features/search-performance/SearchPerformanceColumns";
import { ga4EventsOptions } from "@/client/features/ga4-events/ga4EventsQueries";
import type { getGa4EventsReport } from "@/serverFunctions/ga4Events";

// Fork (all GA4 events): dashboard card and the table on the GA4 Events page.
type Report = Awaited<ReturnType<typeof getGa4EventsReport>>;

export function Ga4EventsCard({ projectId }: { projectId: string }) {
  const query = useQuery(ga4EventsOptions(projectId));
  const report = query.data;
  if (report?.status === "error" && report.code === "ga4_not_connected") {
    return null; // the GA4 card already offers to connect
  }
  return (
    <CardShell
      title="GA4 events"
      titleInfo={<span className={cardMetaClass}>Last 28 days, all channels</span>}
      action={
        <Link
          to="/p/$projectId/ga4-events"
          params={{ projectId }}
          className={moreDetailsClass}
        >
          More details
        </Link>
      }
    >
      <Ga4EventsTable report={report} isError={query.isError} topRows={8} />
    </CardShell>
  );
}

export function Ga4EventsTable({
  report,
  isError,
  topRows,
}: {
  report: Report | undefined;
  isError: boolean;
  topRows?: number;
}) {
  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        Couldn&rsquo;t load GA4 events. Try again shortly.
      </p>
    );
  }
  if (!report) return <MetricsSkeleton />;
  if (report.status === "error") {
    return (
      <p className="text-sm text-muted-foreground">
        {report.message}
        {report.code === "ga4_report_incompatible"
          ? " If you broke down by a parameter, register it in GA4 as an event-scoped custom dimension first (it can take up to 24 hours to show data)."
          : ""}
      </p>
    );
  }
  if (report.rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No events from {report.range.startDate} to {report.range.endDate}.
      </p>
    );
  }
  const rows = topRows ? report.rows.slice(0, topRows) : report.rows;
  const showChange = report.dimensions.length === 1;
  return (
    <Table className={cardTableClass}>
      <TableHeader>
        <TableRow>
          {report.dimensions.map((dimension) => (
            <TableHead key={dimension}>
              {dimension.replace(/^customEvent:/, "")}
            </TableHead>
          ))}
          <TableHead className="text-right">Events</TableHead>
          {showChange ? (
            <TableHead className="text-right">vs. previous</TableHead>
          ) : null}
          <TableHead className="text-right">Users</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const key = report.dimensions.map((d) => row[d]).join(" · ");
          const count = Number(row.eventCount ?? 0);
          const previous = report.previous[String(row.eventName ?? "")];
          const change =
            previous == null ? null : percentChange(count, previous);
          return (
            <TableRow key={key}>
              {report.dimensions.map((dimension) => (
                <TableCell key={dimension} className="max-w-0 truncate">
                  {String(row[dimension] ?? "")}
                </TableCell>
              ))}
              <TableCell className="text-right">{formatCount(count)}</TableCell>
              {showChange ? (
                <TableCell className="text-right text-muted-foreground">
                  {change == null ? "—" : `${change > 0 ? "+" : ""}${Math.round(change)} %`}
                </TableCell>
              ) : null}
              <TableCell className="text-right">
                {formatCount(Number(row.totalUsers ?? 0))}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
