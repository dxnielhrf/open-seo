import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { hasOrgPermission } from "@/lib/org-permissions";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { BingService } from "@/server/features/bing/BingService";
import { requireProjectContext } from "@/serverFunctions/middleware";

// Fork (Bing Webmaster Tools).
const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const connectSchema = projectScopedSchema.extend({
  apiKey: z.string().trim().min(1).max(200),
  siteUrl: z.string().trim().max(500).optional(),
});

export const getBingConnection = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => ({
    ...(await BingService.getStatus(context.projectId)),
    canManage: hasOrgPermission(context.role, { integration: ["manage"] }),
  }));

export const connectBing = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(connectSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return BingService.connect({
      projectId: context.projectId,
      organizationId: context.organizationId,
      userId: context.userId,
      apiKey: data.apiKey,
      siteUrl: data.siteUrl || undefined,
    });
  });

export const disconnectBing = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    await BingService.disconnect(context.projectId);
    return { connected: false as const };
  });

export const getBingReport = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => BingService.getReport(context.projectId));

export const getBingBacklinks = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => BingService.getBacklinks(context.projectId));
