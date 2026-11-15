import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { revalidateLogic } from "@tanstack/react-form";
import { useAppForm } from "@/client/components/form/useAppForm";
import { CardShell } from "@/client/components/CardShell";
import { QueryError } from "@/client/components/QueryState";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import { Button } from "@/client/components/ui/button";
import { clarityConnectionOptions } from "@/client/features/clarity/clarityQueries";
import { connectClarity, disconnectClarity } from "@/serverFunctions/clarity";

// Fork (Microsoft Clarity).
const formSchema = z.object({
  token: z.string().trim().min(1, "Paste your Clarity API token."),
  clarityProjectId: z.string(),
});

const PROBLEMS = {
  invalid_token: "Clarity rejected this token.",
  rate_limited:
    "Clarity's daily limit of 10 requests is used up. Try again tomorrow.",
  failed: "Couldn't reach Clarity. Try again shortly.",
} as const;

export function ClaritySettings({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const connectionQuery = useQuery(clarityConnectionOptions(projectId));

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["clarityConnection", projectId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["clarityInsights", projectId],
      }),
    ]);

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectClarity({ data: { projectId } }),
    onSuccess: refresh,
  });

  const form = useAppForm({
    defaultValues: { token: "", clarityProjectId: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: formSchema },
    onSubmit: async ({ value, formApi }) => {
      const result = await connectClarity({
        data: {
          projectId,
          token: value.token,
          clarityProjectId: value.clarityProjectId,
        },
      });
      if (!result.connected) {
        toast.error(PROBLEMS[result.problem]);
        return;
      }
      formApi.reset();
      if (result.snapshotError) {
        toast.warning(`Connected. First snapshot: ${result.snapshotError}`);
      } else {
        toast.success("Connected to Microsoft Clarity");
      }
      await refresh();
    },
  });

  const status = connectionQuery.data;
  return (
    <section id="clarity" className="scroll-mt-6">
      <CardShell title="Microsoft Clarity">
        {connectionQuery.isError ? (
          <QueryError
            error={connectionQuery.error}
            fallback="Couldn't load the Clarity connection."
            onRetry={() => void connectionQuery.refetch()}
            isRetrying={connectionQuery.isFetching}
          />
        ) : !status ? null : (
          <div className="flex flex-1 flex-col gap-4 text-sm">
            <p className="text-muted-foreground">
              {status.connected ? (
                <>
                  Connected
                  {status.clarityProjectId
                    ? ` to Clarity project ${status.clarityProjectId}`
                    : ""}
                  . The token is stored encrypted. A snapshot of the last 24
                  hours is saved daily at 03:17 UTC (4 of Clarity&rsquo;s 10
                  API requests per day). Last snapshot:{" "}
                  {status.lastSnapshotAt ?? "none yet"}.
                  {status.lastError ? ` Problem: ${status.lastError}` : ""}
                </>
              ) : (
                <>
                  See sessions, scroll depth, engagement, dead and rage clicks
                  by page, source and device. Create a token in{" "}
                  <SafeExternalLink
                    url="https://clarity.microsoft.com/"
                    label="Microsoft Clarity"
                    className="underline underline-offset-2"
                  />{" "}
                  under Settings → Data Export → Generate new API token.
                  Connecting uses 4 of the 10 daily API requests.
                </>
              )}
            </p>
            {status.canManage ? (
              <form.AppForm>
                <form.Form className="space-y-3">
                  <form.AppField name="token">
                    {(field) => (
                      <field.TextField
                        label={
                          status.connected ? "Replace API token" : "API token"
                        }
                        type="password"
                        autoComplete="off"
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="clarityProjectId">
                    {(field) => (
                      <field.TextField
                        label="Clarity project ID (optional, label only)"
                        placeholder={status.clarityProjectId ?? "e.g. ab12cd34ef"}
                      />
                    )}
                  </form.AppField>
                  <div className="flex flex-wrap gap-2">
                    <form.SubmitButton>
                      {status.connected ? "Save token" : "Connect Clarity"}
                    </form.SubmitButton>
                    {status.connected ? (
                      <Button
                        type="button"
                        variant="outline"
                        pending={disconnectMutation.isPending}
                        onClick={() => disconnectMutation.mutate()}
                      >
                        Disconnect
                      </Button>
                    ) : null}
                  </div>
                </form.Form>
              </form.AppForm>
            ) : null}
          </div>
        )}
      </CardShell>
    </section>
  );
}
