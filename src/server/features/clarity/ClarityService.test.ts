import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClarityService,
  combineDays,
  parseClarityMetrics,
  snapshotDateFor,
} from "./ClarityService";

const { getProject, upsert, saveSnapshot, setSnapshotResult } = vi.hoisted(
  () => ({
    getProject: vi.fn(),
    upsert: vi.fn((_row: { encryptedToken: string }) => Promise.resolve()),
    saveSnapshot: vi.fn((_row: { dimension: string }) => Promise.resolve()),
    setSnapshotResult: vi.fn(),
  }),
);
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: { getProjectForOrganization: getProject },
}));
vi.mock("@/server/features/clarity/ClarityRepository", () => ({
  ClarityRepository: { upsert, saveSnapshot, setSnapshotResult },
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: async () => "a-test-secret-that-is-long-enough-123",
}));

const TOKEN = "clarity-test-token";
const fetchMock = vi.fn<typeof fetch>();
const scope = { projectId: "p1", organizationId: "o1", userId: "u1" };
const traffic = (sessions: string, extra: Record<string, string> = {}) => ({
  metricName: "Traffic",
  information: [
    {
      totalSessionCount: sessions,
      totalBotSessionCount: "2",
      PagesPerSessionPercentage: 1.5,
      ...extra,
    },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  getProject.mockResolvedValue({ domain: "example.com" });
  fetchMock.mockImplementation(
    async () => new Response(JSON.stringify([traffic("10")])),
  );
});

describe("ClarityService.connect", () => {
  it("checks the token, stores it encrypted and saves 4 snapshots", async () => {
    const result = await ClarityService.connect({ ...scope, token: TOKEN });

    expect(result).toEqual({ connected: true, snapshotError: null });
    expect(upsert.mock.calls[0]?.[0].encryptedToken).not.toContain(TOKEN);
    // Totals call reused as the first snapshot: 1 + URL, Source, Device.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const auth = new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get(
      "authorization",
    );
    expect(auth).toBe(`Bearer ${TOKEN}`);
    expect(saveSnapshot.mock.calls.map((c) => c[0].dimension)).toEqual([
      "",
      "URL",
      "Source",
      "Device",
    ]);
  });

  it("reports a rejected token without storing it", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 401 }));
    const result = await ClarityService.connect({ ...scope, token: TOKEN });
    expect(result).toEqual({ connected: false, problem: "invalid_token" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("stops after the daily limit and records it", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify([traffic("1")])))
      .mockResolvedValue(new Response("", { status: 429 }));
    const result = await ClarityService.connect({ ...scope, token: TOKEN });
    expect(result.connected && result.snapshotError).toMatch(/daily limit/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("Clarity snapshot maths", () => {
  it("labels a window by its midpoint day", () => {
    expect(snapshotDateFor(new Date("2026-11-16T03:17:00Z"))).toBe(
      "2026-11-15",
    );
  });

  it("parses numeric strings and sums counts, averages rates", () => {
    const day1 = parseClarityMetrics([
      traffic("10"),
      {
        metricName: "PopularPages",
        information: [
          { url: "https://a/", visitsCount: "5" },
          { url: "https://b/", visitsCount: "9" },
        ],
      },
    ]);
    const day2 = parseClarityMetrics([
      traffic("30", { PagesPerSessionPercentage: "2.5" }),
      {
        metricName: "PopularPages",
        information: [{ url: "https://a/", visitsCount: "7" }],
      },
    ]);
    const combined = combineDays([day1, day2]);
    expect(combined.Traffic).toEqual([
      {
        totalSessionCount: 40,
        totalBotSessionCount: 4,
        PagesPerSessionPercentage: 2,
      },
    ]);
    expect(combined.PopularPages).toEqual([
      { url: "https://a/", visitsCount: 12 },
      { url: "https://b/", visitsCount: 9 },
    ]);
  });
});
