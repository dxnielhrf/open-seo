import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CardShell } from "@/client/components/CardShell";
import { BingReportBody } from "@/client/features/bing/BingCard";
import { bingReportOptions } from "@/client/features/bing/bingQueries";
import { pageHead } from "@/client/lib/pageHead";
import { queryClient } from "@/client/tanstack-db/queryClient";

// Fork (Bing Webmaster Tools).
export const Route = createFileRoute("/_app/p/$projectId/bing")({
  head: () => pageHead("Bing Insights"),
  loader: ({ params }) => {
    void queryClient.prefetchQuery(bingReportOptions(params.projectId));
  },
  component: BingRoute,
});

function BingRoute() {
  const { projectId } = Route.useParams();
  const reportQuery = useQuery(bingReportOptions(projectId));
  const report = reportQuery.data;
  return (
    <div className="px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold">Bing Insights</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {report?.connected
              ? `${report.siteUrl} · ${report.range.start} to ${report.range.end}`
              : "Bing Webmaster Tools data for this project."}
          </p>
        </div>
        <CardShell title="Bing Webmaster Tools">
          <BingReportBody
            report={report}
            isError={reportQuery.isError}
            topRows={10}
          />
        </CardShell>
      </div>
    </div>
  );
}
