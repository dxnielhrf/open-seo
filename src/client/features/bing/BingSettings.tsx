import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { revalidateLogic } from "@tanstack/react-form";
import { useAppForm } from "@/client/components/form/useAppForm";
import { CardShell } from "@/client/components/CardShell";
import { QueryError } from "@/client/components/QueryState";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import { Button } from "@/client/components/ui/button";
import { bingConnectionOptions } from "@/client/features/bing/bingQueries";
import { connectBing, disconnectBing } from "@/serverFunctions/bing";

// Fork (Bing Webmaster Tools).
const formSchema = z.object({
  apiKey: z.string().trim().min(1, "Paste your Bing API key."),
  siteUrl: z.string(),
});

const PROBLEMS = {
  invalid_key: "Bing rejected this API key.",
  site_not_found: "This key has no verified Bing site matching the project.",
  failed: "Couldn't reach Bing. Try again shortly.",
} as const;

export function BingSettings({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const connectionQuery = useQuery(bingConnectionOptions(projectId));
  const [sites, setSites] = useState<string[]>([]);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["bingConnection", projectId],
      }),
      queryClient.invalidateQueries({ queryKey: ["bingReport", projectId] }),
    ]);

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectBing({ data: { projectId } }),
    onSuccess: refresh,
  });

  const form = useAppForm({
    defaultValues: { apiKey: "", siteUrl: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: formSchema },
    onSubmit: async ({ value, formApi }) => {
      const result = await connectBing({
        data: { projectId, apiKey: value.apiKey, siteUrl: value.siteUrl },
      });
      if (!result.connected) {
        setSites(result.sites);
        toast.error(PROBLEMS[result.problem]);
        return;
      }
      setSites([]);
      formApi.reset();
      toast.success(`Connected to ${result.siteUrl}`);
      await refresh();
    },
  });

  return (
    <section id="bing" className="scroll-mt-6">
      <CardShell title="Bing Webmaster Tools">
        {connectionQuery.isError ? (
          <QueryError
            error={connectionQuery.error}
            fallback="Couldn't load the Bing connection."
            onRetry={() => void connectionQuery.refetch()}
            isRetrying={connectionQuery.isFetching}
          />
        ) : !connectionQuery.data ? null : (
          <div className="flex flex-1 flex-col gap-4 text-sm">
            <p className="text-muted-foreground">
              {connectionQuery.data.connected ? (
                <>
                  Connected to{" "}
                  <span className="text-foreground">
                    {connectionQuery.data.siteUrl}
                  </span>
                  . The API key is stored encrypted.
                </>
              ) : (
                <>
                  See Bing clicks, impressions, top queries and crawl stats.
                  Create an API key in{" "}
                  <SafeExternalLink
                    url="https://www.bing.com/webmasters/"
                    label="Bing Webmaster Tools"
                    className="underline underline-offset-2"
                  />{" "}
                  under Settings → API access.
                </>
              )}
            </p>
            {connectionQuery.data.canManage ? (
              <form.AppForm>
                <form.Form className="space-y-3">
                  <form.AppField name="apiKey">
                    {(field) => (
                      <field.TextField
                        label={
                          connectionQuery.data.connected
                            ? "Replace API key"
                            : "API key"
                        }
                        type="password"
                        autoComplete="off"
                      />
                    )}
                  </form.AppField>
                  {sites.length > 0 ? (
                    <form.AppField name="siteUrl">
                      {(field) => (
                        <field.TextField
                          label="Bing site to use"
                          description={`Sites on this key: ${sites.join(", ")}`}
                          placeholder={sites[0]}
                        />
                      )}
                    </form.AppField>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <form.SubmitButton>
                      {connectionQuery.data.connected
                        ? "Save key"
                        : "Connect Bing"}
                    </form.SubmitButton>
                    {connectionQuery.data.connected ? (
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
