import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CardShell } from "@/client/components/CardShell";
import type { ChartConfig } from "@/client/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { clarityInsightsOptions } from "@/client/features/clarity/clarityQueries";
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
import type { ClarityInsights } from "@/server/features/clarity/ClarityService";

// Fork (Microsoft Clarity): the dashboard card, and the same body plus all
// metrics on the Clarity page. Clarity's metric names are matched loosely
// ("Scroll Depth" = "ScrollDepth"); anything missing shows "—".
const chartConfig = {
  sessions: { label: "Sessions", color: "var(--chart-1)" },
} satisfies ChartConfig;

type Row = Record<string, number | string>;
type Connected = Extract<ClarityInsights, { connected: true }>;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

function pick(
  metrics: Record<string, Row[] | Row>,
  metric: string,
  field: RegExp,
): number | null {
  const entry = Object.entries(metrics).find(([k]) => norm(k) === norm(metric));
  const rows = entry?.[1];
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) return null;
  const hit =
    Object.entries(row).find(
      ([k, v]) => field.test(k) && typeof v === "number",
    ) ?? Object.entries(row).find(([, v]) => typeof v === "number");
  return typeof hit?.[1] === "number" ? hit[1] : null;
}

const show = (value: number | null, suffix = "") =>
  value === null
    ? "—"
    : `${Number.isInteger(value) ? formatCount(value) : value.toFixed(2)}${suffix}`;

export function ClarityCard({ projectId }: { projectId: string }) {
  const query = useQuery(clarityInsightsOptions(projectId, 7));
  const insights = query.data;
  return (
    <CardShell
      title="Clarity"
      titleInfo={<span className={cardMetaClass}>Last 7 days</span>}
      action={
        <Link
          to={
            insights?.connected
              ? "/p/$projectId/clarity"
              : "/p/$projectId/settings/integrations"
          }
          params={{ projectId }}
          hash={insights?.connected ? undefined : "clarity"}
          className={moreDetailsClass}
        >
          {insights?.connected ? "More details" : "Connect"}
        </Link>
      }
    >
      <ClarityBody insights={insights} isError={query.isError} />
    </CardShell>
  );
}

export function ClarityBody({
  insights,
  isError,
}: {
  insights: ClarityInsights | undefined;
  isError: boolean;
}) {
  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        Couldn&rsquo;t load Clarity data. Try again shortly.
      </p>
    );
  }
  if (!insights) return <MetricsSkeleton />;
  if (!insights.connected) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a Microsoft Clarity API token in Integrations to see sessions,
        scroll depth, engagement and frustration clicks.
      </p>
    );
  }
  if (insights.snapshotDays === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No Clarity snapshot yet. One is saved daily at 03:17 UTC.
        {insights.lastError ? ` Last problem: ${insights.lastError}` : ""}
      </p>
    );
  }
  return <ClarityDetails insights={insights} />;
}

function ClarityDetails({ insights }: { insights: Connected }) {
  const t = insights.totals;
  const trend = insights.daily.map((day) => ({
    date: day.date,
    sessions: pick(day.metrics, "Traffic", /^totalsessioncount$/i) ?? 0,
  }));
  return (
    <div className="flex flex-1 flex-col gap-4">
      <MetricRow
        metrics={[
          {
            label: "Sessions",
            value: show(pick(t, "Traffic", /^totalsessioncount$/i)),
            change: null,
            dotClass: "bg-chart-1",
          },
          {
            label: "Pages / session",
            value: show(pick(t, "Traffic", /pagespersession/i)),
            change: null,
          },
          {
            label: "Scroll depth",
            value: show(pick(t, "ScrollDepth", /scrolldepth|average/i), " %"),
            change: null,
          },
          {
            label: "Rage clicks",
            value: show(pick(t, "RageClickCount", /subtotal/i)),
            change: null,
          },
        ]}
      />
      {trend.length > 1 ? (
        <TrendChart config={chartConfig} data={trend} />
      ) : null}
      <p className="text-sm text-muted-foreground">
        {insights.snapshotDays} daily snapshot
        {insights.snapshotDays === 1 ? "" : "s"}; bot sessions{" "}
        {show(pick(t, "Traffic", /botsession/i))}, dead clicks{" "}
        {show(pick(t, "DeadClickCount", /subtotal/i))}, quickbacks{" "}
        {show(pick(t, "QuickbackClick", /subtotal/i))}, script errors{" "}
        {show(pick(t, "ScriptErrorCount", /subtotal/i))}.
        {insights.lastError ? ` Last snapshot problem: ${insights.lastError}` : ""}
      </p>
    </div>
  );
}

/** Every metric Clarity returned, as plain tables (Clarity page). */
export function ClarityMetricTables({
  metrics,
}: {
  metrics: Record<string, Row[]>;
}) {
  const entries = Object.entries(metrics).filter(([, rows]) => rows.length);
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No data stored yet.</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      {entries.map(([metric, rows]) => {
        const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
        return (
          <div key={metric} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{metric}</h3>
            <Table className={cardTableClass}>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column}>{column}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={index}>
                    {columns.map((column) => {
                      const value = row[column];
                      return (
                        <TableCell
                          key={column}
                          className={
                            typeof value === "number"
                              ? "text-right"
                              : "max-w-0 truncate"
                          }
                        >
                          {typeof value === "number"
                            ? show(value)
                            : (value ?? "—")}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        );
      })}
    </div>
  );
}
