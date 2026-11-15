// Fork (Microsoft Clarity): a thin client for the Clarity Data Export API.
// https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api
// Limits: the last 1-3 days only, 10 requests per Clarity project per day.
const CLARITY_API =
  "https://www.clarity.ms/export-data/api/v1/project-live-insights";
const REQUEST_TIMEOUT_MS = 20_000;

export const CLARITY_DIMENSIONS = ["URL", "Source", "Device"] as const;
export type ClarityDimension = (typeof CLARITY_DIMENSIONS)[number];

export class ClarityApiError extends Error {
  constructor(
    readonly kind: "invalid_token" | "rate_limited" | "failed",
    message: string,
  ) {
    super(message);
    this.name = "ClarityApiError";
  }
}

/**
 * Fetches the last 24 hours, optionally broken down by one dimension, and
 * returns Clarity's JSON array. The token is never part of an error message.
 */
export async function fetchClarityInsights(
  token: string,
  dimension?: ClarityDimension,
): Promise<unknown> {
  const params = new URLSearchParams({ numOfDays: "1" });
  if (dimension) params.set("dimension1", dimension);
  let response: Response;
  try {
    response = await fetch(`${CLARITY_API}?${params}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ClarityApiError("failed", "Clarity: request failed");
  }
  if (response.status === 401 || response.status === 403) {
    throw new ClarityApiError("invalid_token", "Clarity rejected the token");
  }
  if (response.status === 429) {
    throw new ClarityApiError(
      "rate_limited",
      "Clarity: daily limit of 10 requests reached",
    );
  }
  if (!response.ok) {
    throw new ClarityApiError("failed", `Clarity: HTTP ${response.status}`);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!Array.isArray(body)) {
    throw new ClarityApiError("failed", "Clarity: unexpected response");
  }
  return body;
}
