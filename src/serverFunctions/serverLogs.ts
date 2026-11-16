import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { hasOrgPermission } from "@/lib/org-permissions";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { ServerLogService } from "@/server/features/server-logs/ServerLogService";
import {
  SERVER_LOG_BOTS,
  SERVER_LOG_BREAKDOWNS,
  SERVER_LOG_STATUS_FILTERS,
} from "@/server/features/server-logs/serverLogBots";
import { requireProjectContext } from "@/serverFunctions/middleware";

// Fork (server logs).
const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const statsSchema = projectScopedSchema.extend({
  days: z.number().int().min(1).max(365).default(7),
  breakdown: z.enum(SERVER_LOG_BREAKDOWNS).default("bot"),
  bots: z.union([z.literal("ai"), z.array(z.enum(SERVER_LOG_BOTS))]).optional(),
  status: z.enum(SERVER_LOG_STATUS_FILTERS).default("all"),
});

export const getServerLogSource = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => ({
    ...(await ServerLogService.getStatus(context.projectId)),
    canManage: hasOrgPermission(context.role, { integration: ["manage"] }),
  }));

export const createServerLogToken = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return { token: await ServerLogService.createToken(context.projectId) };
  });

export const disconnectServerLogs = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    await ServerLogService.disconnect(context.projectId);
    return { connected: false as const };
  });

export const getServerLogStats = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(statsSchema)
  .handler(async ({ data, context }) => {
    const end = new Date(Date.now() - 86_400_000);
    const start = new Date(end.getTime() - (data.days - 1) * 86_400_000);
    return ServerLogService.getStats({
      projectId: context.projectId,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      breakdown: data.breakdown,
      bots: data.bots,
      status: data.status,
      limit: 200,
    });
  });

export const getAiCrawlerSummary = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) =>
    ServerLogService.getAiCrawlerSummary(context.projectId),
  );
