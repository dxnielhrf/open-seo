import { beforeEach, describe, expect, it, vi } from "vitest";
import { BingService } from "./BingService";

const { getProject, upsert, getConnection } = vi.hoisted(() => ({
  getProject: vi.fn(),
  upsert: vi.fn((row: { encryptedApiKey: string }) => Promise.resolve(row)),
  getConnection: vi.fn(),
}));
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: { getProjectForOrganization: getProject },
}));
vi.mock("@/server/features/bing/BingConnectionRepository", () => ({
  BingConnectionRepository: {
    upsert,
    getByProjectId: getConnection,
  },
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: async () => "a-test-secret-that-is-long-enough-123",
}));

const API_KEY = "bing-test-key";
const fetchMock = vi.fn<typeof fetch>();
const scope = { projectId: "p1", organizationId: "o1", userId: "u1" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const day = (iso: string) => `/Date(${Date.parse(`${iso}T00:00:00Z`)})/`;

// Answers each Bing method from `payloads`, an empty list otherwise.
function respond(payloads: Record<string, unknown>) {
  fetchMock.mockImplementation(async (input) => {
    const method =
      new URL(input instanceof Request ? input.url : input).pathname
        .split("/")
        .at(-1) ?? "";
    return json({ d: payloads[method] ?? [] });
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  getProject.mockResolvedValue({ domain: "example.com" });
  respond({
    GetUserSites: [
      { Url: "https://other.org/", IsVerified: true },
      { Url: "https://www.example.com/", IsVerified: true },
    ],
  });
});

describe("BingService.connect", () => {
  it("picks the site matching the project's domain and stores the key encrypted", async () => {
    const result = await BingService.connect({ ...scope, apiKey: API_KEY });

    expect(result).toEqual({
      connected: true,
      siteUrl: "https://www.example.com/",
    });
    expect(upsert.mock.calls[0]?.[0].encryptedApiKey).not.toContain(API_KEY);
  });

  it("reports a rejected key without saving it", async () => {
    fetchMock.mockResolvedValue(
      json({ ErrorCode: 3, Message: "InvalidApiKey" }, 400),
    );

    const result = await BingService.connect({ ...scope, apiKey: "wrong" });

    expect(result).toMatchObject({ connected: false, problem: "invalid_key" });
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("BingService.getReport", () => {
  beforeEach(async () => {
    await BingService.connect({ ...scope, apiKey: API_KEY });
    getConnection.mockResolvedValue(upsert.mock.calls[0]?.[0]);
  });

  it("compares the last 28 days with the 28 before and ranks queries", async () => {
    respond({
      GetRankAndTrafficStats: [
        { Date: day("2026-11-13"), Clicks: 2, Impressions: 20 },
        { Date: day("2026-10-17"), Clicks: 1, Impressions: 10 },
        { Date: day("2026-10-16"), Clicks: 5, Impressions: 50 },
      ],
      GetQueryStats: [
        {
          Date: day("2026-11-01"),
          Query: "seo",
          Clicks: 1,
          Impressions: 30,
          AvgImpressionPosition: 4,
        },
        {
          Date: day("2026-11-08"),
          Query: "seo",
          Clicks: 1,
          Impressions: 30,
          AvgImpressionPosition: 6,
        },
        { Date: day("2026-11-08"), Query: "tool", Clicks: 0, Impressions: 5 },
        { Date: day("2026-09-01"), Query: "old", Clicks: 9, Impressions: 99 },
      ],
      GetCrawlStats: [
        { Date: "/Date(1794528000000-0800)/", InIndex: 4 },
        { Date: day("2026-10-01"), InIndex: 1 },
      ],
    });

    const report = await BingService.getReport(
      "p1",
      new Date("2026-11-13T12:00:00Z"),
    );

    expect(report).toMatchObject({
      processing: false,
      range: { start: "2026-10-17", end: "2026-11-13" },
      totals: { clicks: 3, impressions: 30 },
      prevTotals: { clicks: 5, impressions: 50 },
      topQueries: [
        { query: "seo", clicks: 2, impressions: 60, position: 5 },
        { query: "tool", clicks: 0, impressions: 5, position: null },
      ],
      crawl: { inIndex: 4 },
    });
  });

  it("says Bing is still processing when it has no data yet", async () => {
    respond({});

    const report = await BingService.getReport("p1");

    expect(report).toMatchObject({ processing: true, errors: [] });
  });
});
