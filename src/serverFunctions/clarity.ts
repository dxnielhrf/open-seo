import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { hasOrgPermission } from "@/lib/org-permissions";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { ClarityService } from "@/server/features/clarity/ClarityService";
import { CLARITY_DIMENSIONS } from "@/server/lib/clarityClient";
import { requireProjectContext } from "@/serverFunctions/middleware";

// Fork (Microsoft Clarity).
const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const connectSchema = projectScopedSchema.extend({
  token: z.string().trim().min(1).max(4000),
  clarityProjectId: z.string().trim().max(100).optional(),
});
const insightsSchema = projectScopedSchema.extend({
  days: z.number().int().min(1).max(365).default(28),
  dimension: z.enum(CLARITY_DIMENSIONS).nullable().default(null),
});

export const getClarityConnection = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => ({
    ...(await ClarityService.getStatus(context.projectId)),
    canManage: hasOrgPermission(context.role, { integration: ["manage"] }),
  }));

export const connectClarity = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(connectSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return ClarityService.connect({
      projectId: context.projectId,
      organizationId: context.organizationId,
      userId: context.userId,
      token: data.token,
      clarityProjectId: data.clarityProjectId || undefined,
    });
  });

export const disconnectClarity = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    await ClarityService.disconnect(context.projectId);
    return { connected: false as const };
  });

export const getClarityInsights = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(insightsSchema)
  .handler(async ({ data, context }) =>
    ClarityService.getInsights(context.projectId, data.days, data.dimension),
  );
