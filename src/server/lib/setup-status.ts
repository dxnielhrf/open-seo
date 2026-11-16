import { count } from "drizzle-orm";
import { version } from "../../../package.json";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { getAuthMode } from "@/lib/auth-mode";
import { runSelfhostChecks } from "@/lib/selfhost-preflight";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { BingConnectionRepository } from "@/server/features/bing/BingConnectionRepository";
import { ClarityRepository } from "@/server/features/clarity/ClarityRepository";
import { ServerLogRepository } from "@/server/features/server-logs/ServerLogRepository";

// "error" blocks core functionality; "warn" degrades a feature.
type SetupCheck = {
  status: "ok" | "warn" | "error";
  detail?: string;
};

type SelfHostSetupStatus = {
  version: string;
  authMode: string;
  checks: Record<string, SetupCheck>;
};

// The same env vars the Docker preflight validates; /api/health re-runs the
// shared checks against runtime env so the two reports can never drift.
const CHECK_ENV_VARS = [
  "AUTH_MODE",
  "TEAM_DOMAIN",
  "POLICY_AUD",
  "DATAFORSEO_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "OPENROUTER_API_KEY",
  "CONTEXT_API_KEY",
  "EVERYAPP_IDENTITY_PUBLIC_KEYS",
  "EVERYAPP_APP_ID",
] as const;

const LEVEL_TO_STATUS = {
  ok: "ok",
  info: "ok",
  warn: "warn",
  fail: "error",
} as const;

// Fork (Bing Webmaster Tools): the table exists (its migration ran) and how
// many projects have a key. Keys are checked when a report loads, not here.
async function checkBing(): Promise<SetupCheck> {
  try {
    const connected = await BingConnectionRepository.countAll();
    return {
      status: "ok",
      detail: `${connected} project${connected === 1 ? "" : "s"} connected to Bing Webmaster Tools.`,
    };
  } catch (error) {
    console.error("health check: bing_connections query failed", error);
    return { status: "warn", detail: "Bing connections table unavailable." };
  }
}

// Fork (Microsoft Clarity): table exists and how many projects have a token.
async function checkClarity(): Promise<SetupCheck> {
  try {
    const connected = await ClarityRepository.countAll();
    return {
      status: "ok",
      detail: `${connected} project${connected === 1 ? "" : "s"} connected to Microsoft Clarity.`,
    };
  } catch (error) {
    console.error("health check: clarity_connections query failed", error);
    return { status: "warn", detail: "Clarity connections table unavailable." };
  }
}

// Fork (server logs): table exists and how many projects send logs.
async function checkServerLogs(): Promise<SetupCheck> {
  try {
    const connected = await ServerLogRepository.countAll();
    return {
      status: "ok",
      detail: `${connected} project${connected === 1 ? "" : "s"} with a server log token.`,
    };
  } catch (error) {
    console.error("health check: server_log_sources query failed", error);
    return { status: "warn", detail: "Server log tables unavailable." };
  }
}

async function checkDatabase(): Promise<SetupCheck> {
  try {
    await db.select({ value: count() }).from(projects);
    return { status: "ok" };
  } catch (error) {
    // This endpoint is unauthenticated: never surface raw driver messages
    // (they can name hosts and DB users). The real error goes to the logs.
    console.error("health check: database query failed", error);
    return {
      status: "error",
      detail: "Database query failed — check server logs.",
    };
  }
}

export async function getSelfHostSetupStatus(options?: {
  skipDatabaseCheck?: boolean;
}): Promise<SelfHostSetupStatus> {
  const env = Object.fromEntries(
    await Promise.all(
      CHECK_ENV_VARS.map(
        async (name) => [name, await getOptionalEnvValue(name)] as const,
      ),
    ),
  );

  const checks: Record<string, SetupCheck> = {};
  for (const item of runSelfhostChecks(env)) {
    checks[item.key] = {
      status: LEVEL_TO_STATUS[item.level],
      detail: item.message,
    };
  }
  checks.database = options?.skipDatabaseCheck
    ? { status: "ok" }
    : await checkDatabase();
  if (!options?.skipDatabaseCheck) checks.bing = await checkBing();
  if (!options?.skipDatabaseCheck) checks.clarity = await checkClarity();
  if (!options?.skipDatabaseCheck) checks.serverLogs = await checkServerLogs();

  return { version, authMode: getAuthMode(env.AUTH_MODE), checks };
}

// Compact "which checks are unhealthy" list for telemetry: check keys with
// their status, no free-text details (details can name env vars; keep events
// to enumerable values only).
export async function getSetupIssueSummary(): Promise<string[]> {
  const status = await getSelfHostSetupStatus({ skipDatabaseCheck: true });
  return Object.entries(status.checks)
    .filter(([, check]) => check.status !== "ok")
    .map(([key, check]) => `${key}:${check.status}`);
}
