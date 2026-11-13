// Fork (Bing Webmaster Tools): a thin client for Bing's JSON API.
// https://learn.microsoft.com/en-us/bingwebmaster/getting-access
const BING_API = "https://ssl.bing.com/webmaster/api.svc/json/";
const REQUEST_TIMEOUT_MS = 20_000;

export type BingMethod =
  | "GetUserSites"
  | "GetRankAndTrafficStats"
  | "GetQueryStats"
  | "GetPageStats"
  | "GetCrawlStats"
  | "GetLinkCounts"
  | "GetUrlLinks";

export class BingApiError extends Error {
  constructor(
    readonly kind: "invalid_key" | "failed",
    message: string,
  ) {
    super(message);
    this.name = "BingApiError";
  }
}

/**
 * Calls one API method and returns its `d` payload. The API key travels in the
 * query string, so neither the URL nor a fetch error's text is ever surfaced.
 */
export async function callBing(
  method: BingMethod,
  apiKey: string,
  siteUrl?: string,
  extra: Record<string, string> = {},
): Promise<unknown> {
  const params = new URLSearchParams({ apikey: apiKey, ...extra });
  if (siteUrl) params.set("siteUrl", siteUrl);
  let response: Response;
  try {
    response = await fetch(`${BING_API}${method}?${params}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new BingApiError("failed", `Bing ${method}: request failed`);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    // InvalidApiKey comes back as HTTP 400 with ErrorCode 3.
    const errorCode =
      body && typeof body === "object" && "ErrorCode" in body
        ? body.ErrorCode
        : undefined;
    if (errorCode === 3 || response.status === 401) {
      throw new BingApiError("invalid_key", "Bing rejected the API key");
    }
    throw new BingApiError("failed", `Bing ${method}: HTTP ${response.status}`);
  }
  return body && typeof body === "object" && "d" in body ? body.d : null;
}

/** "/Date(1794528000000)/" or "/Date(1794528000000-0800)/" → "2026-11-13" (UTC). */
export function parseBingDate(value: unknown): string | null {
  const match = /\/Date\((-?\d+)/.exec(String(value));
  return match ? new Date(Number(match[1])).toISOString().slice(0, 10) : null;
}
