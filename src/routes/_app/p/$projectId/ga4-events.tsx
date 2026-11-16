import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CardShell } from "@/client/components/CardShell";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Ga4EventsTable } from "@/client/features/ga4-events/Ga4EventsCard";
import { ga4EventsOptions } from "@/client/features/ga4-events/ga4EventsQueries";
import { pageHead } from "@/client/lib/pageHead";
import { queryClient } from "@/client/tanstack-db/queryClient";
import type { Ga4EventBreakdown } from "@/server/features/ga4/services/Ga4ReportDefinitions";

// Fork (all GA4 events).
const BREAKDOWNS: { value: Ga4EventBreakdown; label: string }[] = [
  { value: "event", label: "Event" },
  { value: "event_and_page", label: "Event + page" },
  { value: "event_and_source", label: "Event + source" },
  { value: "event_and_param", label: "Event + parameter" },
];

export const Route = createFileRoute("/_app/p/$projectId/ga4-events")({
  head: () => pageHead("GA4 Events"),
  loader: ({ params }) => {
    void queryClient.prefetchQuery(ga4EventsOptions(params.projectId));
  },
  component: Ga4EventsRoute,
});

function Ga4EventsRoute() {
  const { projectId } = Route.useParams();
  const [breakdown, setBreakdown] = useState<Ga4EventBreakdown>("event");
  const [channel, setChannel] = useState<"all" | "organic_search">("all");
  const [parameterDraft, setParameterDraft] = useState("lead_source");
  const [parameter, setParameter] = useState("lead_source");
  const query = useQuery(
    ga4EventsOptions(
      projectId,
      breakdown,
      breakdown === "event_and_param" ? parameter : undefined,
      channel,
    ),
  );
  const report = query.data;
  return (
    <div className="px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold">GA4 Events</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {report?.status === "ok"
              ? `All GA4 events · ${report.range.startDate} to ${report.range.endDate}`
              : "All GA4 events, not only key events."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {BREAKDOWNS.map((item) => (
            <Button
              key={item.value}
              size="sm"
              variant={item.value === breakdown ? "default" : "outline"}
              onClick={() => setBreakdown(item.value)}
            >
              {item.label}
            </Button>
          ))}
          {(["all", "organic_search"] as const).map((c) => (
            <Button
              key={c}
              size="sm"
              variant={c === channel ? "default" : "outline"}
              onClick={() => setChannel(c)}
            >
              {c === "all" ? "All channels" : "Organic Search"}
            </Button>
          ))}
        </div>
        {breakdown === "event_and_param" ? (
          <form
            className="flex max-w-md gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setParameter(parameterDraft.trim());
            }}
          >
            <Input
              aria-label="Event parameter (custom dimension)"
              value={parameterDraft}
              onChange={(event) => setParameterDraft(event.target.value)}
              placeholder="lead_source"
            />
            <Button type="submit" size="sm">
              Show
            </Button>
          </form>
        ) : null}
        <CardShell title="Events">
          <Ga4EventsTable report={report} isError={query.isError} />
        </CardShell>
      </div>
    </div>
  );
}
