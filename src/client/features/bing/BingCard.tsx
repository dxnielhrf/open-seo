import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CardShell } from "@/client/components/CardShell";
import { percentChange } from "@/client/components/MetricsTable";
import type { ChartConfig } from "@/client/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { bingReportOptions } from "@/client/features/bing/bingQueries";
import {
  cardMetaClass,
  cardTableClass,
  moreDetailsClass,
} from "@/client/features/dashboard/cardParts";
import {
  MetricRow,
  MetricsSkeleton,
  TrendChart,
} from "@/client/features/dashboard/DashboardMetrics";
import { formatCount } from "@/client/features/search-performance/SearchPerformanceColumns";
import type { BingReport } from "@/server/features/bing/BingService";

// Fork (Bing Webmaster Tools): the dashboard card, and the same body at full
// length on the Bing page.
const chartConfig = {
  clicks: { label: "Clicks", color: "var(--chart-1)" },
  impressions: { label: "Impressions", color: "var(--chart-2)" },
} satisfies ChartConfig;

type ConnectedReport = Extract<BingReport, { connected: true }>;

export function BingCard({ projectId }: { projectId: string }) {
  const reportQuery = useQuery(bingReportOptions(projectId));
  const report = reportQuery.data;
  return (
    <CardShell
      title="Bing"
      titleInfo={<span className={cardMetaClass}>Last 28 days</span>}
      action={
        <Link
          to={
            report?.connected
              ? "/p/$projectId/bing"
              : "/p/$projectId/settings/integrations"
          }
          params={{ projectId }}
          hash={report?.connected ? undefined : "bing"}
          className={moreDetailsClass}
        >
          {report?.connected ? "More details" : "Connect"}
        </Link>
      }
    >
      <BingReportBody
        report={report}
        isError={reportQuery.isError}
        topRows={5}
      />
    </CardShell>
  );
}

export function BingReportBody({
  report,
  isError,
  topRows,
}: {
  report: BingReport | undefined;
  isError: boolean;
  topRows: number;
}) {
  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        Couldn&rsquo;t load Bing data. Try again shortly.
      </p>
    );
  }
  if (!report) return <MetricsSkeleton />;
  if (!report.connected) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a Bing Webmaster Tools API key in Integrations to see Bing clicks,
        impressions, queries and crawl stats.
      </p>
    );
  }
  if (report.invalidKey) {
    return (
      <p className="text-sm text-muted-foreground">
        Bing rejected the stored API key. Replace it in Integrations.
      </p>
    );
  }
  if (report.processing) {
    return (
      <p className="text-sm text-muted-foreground">
        Bing is still processing {report.siteUrl}. Data usually appears within a
        few days of verifying the site.
      </p>
    );
  }
  return <BingReportDetails report={report} topRows={topRows} />;
}

function BingReportDetails({
  report,
  topRows,
}: {
  report: ConnectedReport;
  topRows: number;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <MetricRow
        metrics={[
          {
            label: "Clicks",
            value: formatCount(report.totals.clicks),
            change: percentChange(
              report.totals.clicks,
              report.prevTotals.clicks,
            ),
            dotClass: "bg-chart-1",
          },
          {
            label: "Impressions",
            value: formatCount(report.totals.impressions),
            change: percentChange(
              report.totals.impressions,
              report.prevTotals.impressions,
            ),
            dotClass: "bg-chart-2",
          },
          {
            label: "In index",
            value:
              report.crawl?.inIndex == null
                ? "—"
                : formatCount(report.crawl.inIndex),
            change: null,
          },
          {
            label: "Crawl errors",
            value:
              report.crawl?.crawlErrors == null
                ? "—"
                : formatCount(report.crawl.crawlErrors),
            change: null,
          },
        ]}
      />
      {report.trend.length > 1 ? (
        <TrendChart config={chartConfig} data={report.trend} />
      ) : null}
      <TopTable
        label="Query"
        rows={report.topQueries
          .slice(0, topRows)
          .map((row) => ({ ...row, key: row.query }))}
      />
      {topRows > 5 ? (
        <TopTable
          label="Page"
          rows={report.topPages.map((row) => ({ ...row, key: row.page }))}
        />
      ) : null}
      {report.crawl && topRows > 5 ? (
        <p className="text-sm text-muted-foreground">
          Crawl {report.crawl.date}: {report.crawl.crawledPages ?? "—"} pages
          crawled, {report.crawl.code4xx ?? 0} 4xx, {report.crawl.code5xx ?? 0}{" "}
          5xx, {report.crawl.blockedByRobotsTxt ?? 0} blocked by robots.txt,{" "}
          {report.crawl.inLinks ?? "—"} inbound links.
        </p>
      ) : null}
      {report.errors.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Some Bing data couldn&rsquo;t load: {report.errors.join("; ")}
        </p>
      ) : null}
    </div>
  );
}

function TopTable({
  label,
  rows,
}: {
  label: string;
  rows: {
    key: string;
    clicks: number;
    impressions: number;
    position: number | null;
  }[];
}) {
  if (rows.length === 0) return null;
  return (
    <Table className={cardTableClass}>
      <TableHeader>
        <TableRow>
          <TableHead>{label}</TableHead>
          <TableHead className="text-right">Clicks</TableHead>
          <TableHead className="text-right">Impressions</TableHead>
          <TableHead className="text-right">Position</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell className="max-w-0 truncate">{row.key}</TableCell>
            <TableCell className="text-right">
              {formatCount(row.clicks)}
            </TableCell>
            <TableCell className="text-right">
              {formatCount(row.impressions)}
            </TableCell>
            <TableCell className="text-right">{row.position ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
