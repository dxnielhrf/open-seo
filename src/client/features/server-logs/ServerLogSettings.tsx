import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CardShell } from "@/client/components/CardShell";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { serverLogSourceOptions } from "@/client/features/server-logs/serverLogQueries";
import {
  createServerLogToken,
  disconnectServerLogs,
} from "@/serverFunctions/serverLogs";

// Fork (server logs).
export function ServerLogSettings({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const sourceQuery = useQuery(serverLogSourceOptions(projectId));
  const [token, setToken] = useState<string | null>(null);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["serverLogSource", projectId],
      }),
      queryClient.invalidateQueries({ queryKey: ["serverLogStats", projectId] }),
    ]);
  const createMutation = useMutation({
    mutationFn: () => createServerLogToken({ data: { projectId } }),
    onSuccess: async (result) => {
      setToken(result.token);
      await refresh();
    },
  });
  const disconnectMutation = useMutation({
    mutationFn: () => disconnectServerLogs({ data: { projectId } }),
    onSuccess: async () => {
      setToken(null);
      await refresh();
    },
  });
  const status = sourceQuery.data;
  return (
    <section id="server-logs" className="scroll-mt-6">
      <CardShell title="Server logs (AI crawlers)">
        {sourceQuery.isError ? (
          <QueryError
            error={sourceQuery.error}
            fallback="Couldn't load the server log settings."
            onRetry={() => void sourceQuery.refetch()}
            isRetrying={sourceQuery.isFetching}
          />
        ) : !status ? null : (
          <div className="flex flex-1 flex-col gap-4 text-sm">
            <p className="text-muted-foreground">
              A script aggregates your web server&rsquo;s access logs per day
              (path, status, bot class) and posts only those totals to
              <code className="mx-1">/api/fork/server-logs</code>
              with an ingest token. No IPs, user agents or referrers are
              stored.{" "}
              {status.connected
                ? `Last day received: ${status.lastIngestDate ?? "none yet"}.`
                : "No token yet."}
            </p>
            {token ? (
              <div className="flex flex-col gap-1">
                <p className="font-medium">
                  Copy this token now; it is shown only once:
                </p>
                <code className="break-all rounded bg-muted p-2">{token}</code>
              </div>
            ) : null}
            {status.canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  pending={createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                >
                  {status.connected ? "Replace token" : "Create token"}
                </Button>
                {status.connected ? (
                  <Button
                    type="button"
                    variant="outline"
                    pending={disconnectMutation.isPending}
                    onClick={() => disconnectMutation.mutate()}
                  >
                    Revoke token
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </CardShell>
    </section>
  );
}
