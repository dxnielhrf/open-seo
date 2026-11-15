import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CardShell } from "@/client/components/CardShell";
import { Button } from "@/client/components/ui/button";
import {
  ClarityBody,
  ClarityMetricTables,
} from "@/client/features/clarity/ClarityCard";
import { clarityInsightsOptions } from "@/client/features/clarity/clarityQueries";
import { pageHead } from "@/client/lib/pageHead";
import { queryClient } from "@/client/tanstack-db/queryClient";
import {
  CLARITY_DIMENSIONS,
  type ClarityDimension,
} from "@/server/lib/clarityClient";

// Fork (Microsoft Clarity).
const RANGES = [7, 28, 90] as const;

export const Route = createFileRoute("/_app/p/$projectId/clarity")({
  head: () => pageHead("Clarity Insights"),
  loader: ({ params }) => {
    void queryClient.prefetchQuery(
      clarityInsightsOptions(params.projectId, 28),
    );
  },
  component: ClarityRoute,
});

function ClarityRoute() {
  const { projectId } = Route.useParams();
  const [days, setDays] = useState<number>(28);
  const [dimension, setDimension] = useState<ClarityDimension>("URL");
  const totalsQuery = useQuery(clarityInsightsOptions(projectId, days));
  const breakdownQuery = useQuery(
    clarityInsightsOptions(projectId, days, dimension),
  );
  const insights = totalsQuery.data;
  const breakdown = breakdownQuery.data;
  return (
    <div className="px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Clarity Insights</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {insights?.connected
                ? `Microsoft Clarity · ${insights.range.start} to ${insights.range.end} · counts summed, rates and times averaged over the stored days`
                : "Microsoft Clarity data for this project."}
            </p>
          </div>
          <div className="flex gap-1">
            {RANGES.map((range) => (
              <Button
                key={range}
                size="sm"
                variant={range === days ? "default" : "outline"}
                onClick={() => setDays(range)}
              >
                {range} days
              </Button>
            ))}
          </div>
        </div>
        <CardShell title="Overview">
          <ClarityBody insights={insights} isError={totalsQuery.isError} />
        </CardShell>
        {insights?.connected && insights.snapshotDays > 0 ? (
          <>
            <CardShell
              title="Breakdown"
              action={
                <div className="flex gap-1">
                  {CLARITY_DIMENSIONS.map((d) => (
                    <Button
                      key={d}
                      size="sm"
                      variant={d === dimension ? "default" : "outline"}
                      onClick={() => setDimension(d)}
                    >
                      {d}
                    </Button>
                  ))}
                </div>
              }
            >
              {breakdown?.connected && breakdown.breakdown ? (
                <ClarityMetricTables metrics={breakdown.breakdown} />
              ) : (
                <p className="text-sm text-muted-foreground">Loading…</p>
              )}
            </CardShell>
            <CardShell title="All metrics (site-wide)">
              <ClarityMetricTables metrics={insights.totals} />
            </CardShell>
          </>
        ) : null}
      </div>
    </div>
  );
}
