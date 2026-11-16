import { createFileRoute } from "@tanstack/react-router";
import { ServerLogService } from "@/server/features/server-logs/ServerLogService";

// Fork (server logs): the aggregation script posts one day per request,
// authenticated with the project's ingest token (Settings → Integrations).
export const Route = createFileRoute("/api/fork/server-logs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: unknown = await request.json().catch(() => null);
        const result = await ServerLogService.ingest(
          request.headers.get("authorization"),
          body,
        );
        return result.ok
          ? Response.json({ ok: true, rows: result.rows })
          : Response.json(
              { ok: false, error: result.error },
              { status: result.status },
            );
      },
    },
  },
});
