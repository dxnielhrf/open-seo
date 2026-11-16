import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServerLogService } from "./ServerLogService";

const { setToken, getSourceByTokenHash, replaceDay } = vi.hoisted(() => ({
  setToken: vi.fn((_projectId: string, _hash: string) => Promise.resolve()),
  getSourceByTokenHash: vi.fn(),
  replaceDay: vi.fn((_input: { date: string }) => Promise.resolve()),
}));
vi.mock("@/server/features/server-logs/ServerLogRepository", () => ({
  ServerLogRepository: { setToken, getSourceByTokenHash, replaceDay },
}));

const day = {
  date: "2026-11-15",
  rows: [{ path: "/blog", status: 200, bot: "GPTBot", hits: 3 }],
};

beforeEach(() => vi.clearAllMocks());

describe("ServerLogService", () => {
  it("stores only the token's hash and accepts it on ingest", async () => {
    const token = await ServerLogService.createToken("p1");
    expect(token).toMatch(/^osl_[0-9a-f]{64}$/);
    const hash = setToken.mock.calls[0]?.[1];
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token.slice(4));

    getSourceByTokenHash.mockImplementation(async (h: string) =>
      h === hash ? { projectId: "p1" } : null,
    );
    const result = await ServerLogService.ingest(`Bearer ${token}`, day);
    expect(result).toEqual({ ok: true, projectId: "p1", rows: 1 });
    expect(replaceDay.mock.calls[0]?.[0].date).toBe("2026-11-15");
  });

  it("rejects a wrong token and an unknown bot class", async () => {
    getSourceByTokenHash.mockResolvedValue(null);
    expect(
      await ServerLogService.ingest(`Bearer osl_${"0".repeat(64)}`, day),
    ).toMatchObject({ ok: false, status: 401 });
    expect(await ServerLogService.ingest(null, day)).toMatchObject({
      ok: false,
      status: 401,
    });

    getSourceByTokenHash.mockResolvedValue({ projectId: "p1" });
    const bad = { ...day, rows: [{ ...day.rows[0], bot: "Mozilla/5.0" }] };
    expect(
      await ServerLogService.ingest(`Bearer osl_${"1".repeat(64)}`, bad),
    ).toMatchObject({ ok: false, status: 400 });
    expect(replaceDay).not.toHaveBeenCalled();
  });
});
