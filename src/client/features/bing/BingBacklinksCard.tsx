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
import { MetricsSkeleton } from "@/client/features/dashboard/DashboardMetrics";
import {
  cardMetaClass,
  cardTableClass,
  moreDetailsClass,
} from "@/client/features/dashboard/cardParts";
import { bingBacklinksOptions } from "@/client/features/bing/bingQueries";

// Fork (Bing Webmaster Tools): inbound links Bing knows of. Renders nothing
// for a project without a Bing connection, so the Backlinks page can host it.
export function BingBacklinksCard({
  projectId,
  linkToBingPage = false,
}: {
  projectId: string;
  linkToBingPage?: boolean;
}) {
  const query = useQuery(bingBacklinksOptions(projectId));
  const data = query.data;
  if (data && !data.connected) return null;

  return (
    <CardShell
      title="Inbound links (Bing)"
      titleInfo={
        data?.connected ? (
          <span className={cardMetaClass}>
            {data.totalLinks} links · {data.domains.length} referring domains
          </span>
        ) : null
      }
      action={
        linkToBingPage ? (
          <Link
            to="/p/$projectId/bing"
            params={{ projectId }}
            className={moreDetailsClass}
          >
            Bing Insights
          </Link>
        ) : null
      }
    >
      {query.isError ? (
        <p className="text-sm text-muted-foreground">
          Couldn&rsquo;t load Bing links. Try again shortly.
        </p>
      ) : !data ? (
        <MetricsSkeleton />
      ) : data.invalidKey ? (
        <p className="text-sm text-muted-foreground">
          Bing rejected the stored API key. Replace it in Integrations.
        </p>
      ) : data.links.length === 0 && data.targets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Bing reports no inbound links for {data.siteUrl} yet.
          {data.errors.length > 0 ? ` (${data.errors.join("; ")})` : ""}
        </p>
      ) : (
        <div className="flex flex-col gap-4 text-sm">
          <Table className={cardTableClass}>
            <TableHeader>
              <TableRow>
                <TableHead>Referring domain</TableHead>
                <TableHead className="text-right">Links</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.domains.map((row) => (
                <TableRow key={row.domain}>
                  <TableCell>{row.domain}</TableCell>
                  <TableCell className="text-right">{row.links}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Table className={cardTableClass}>
            <TableHeader>
              <TableRow>
                <TableHead>Linking page</TableHead>
                <TableHead>Anchor text</TableHead>
                <TableHead>Target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.links.map((row) => (
                <TableRow key={`${row.source}|${row.target}`}>
                  <TableCell className="max-w-0 truncate">
                    {row.source}
                  </TableCell>
                  <TableCell className="max-w-0 truncate">
                    {row.anchorText ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-0 truncate">
                    {row.target}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {data.errors.length > 0 ? (
            <p className="text-muted-foreground">
              Some Bing data couldn&rsquo;t load: {data.errors.join("; ")}
            </p>
          ) : null}
        </div>
      )}
    </CardShell>
  );
}
