import { describe, expect, it } from "vitest";
import { buildGa4ReportRequest } from "./Ga4ReportDefinitions";

// Fork (all GA4 events).
const base = {
  kind: "events" as const,
  startDate: "2026-11-01",
  endDate: "2026-11-14",
  limit: 100,
  offset: 0,
};

describe("events report request", () => {
  it("lists every event by count, without a key-event filter", () => {
    const request = buildGa4ReportRequest({ ...base, channel: "all" });
    expect(request.dimensions).toEqual([{ name: "eventName" }]);
    expect(request.metrics).toEqual([
      { name: "eventCount" },
      { name: "totalUsers" },
    ]);
    expect(request.metricFilter).toBeUndefined();
    expect(request.dimensionFilter).toBeUndefined();
  });

  it("breaks down by a custom event parameter and filters names and channel", () => {
    const request = buildGa4ReportRequest({
      ...base,
      channel: "organic_search",
      eventBreakdown: "event_and_param",
      eventParameter: "lead_source",
      eventNames: ["generate_lead"],
    });
    expect(request.dimensions).toEqual([
      { name: "eventName" },
      { name: "customEvent:lead_source" },
    ]);
    expect(request.dimensionFilter).toEqual({
      andGroup: {
        expressions: [
          {
            filter: {
              fieldName: "eventName",
              inListFilter: { values: ["generate_lead"] },
            },
          },
          {
            filter: {
              fieldName: "sessionDefaultChannelGroup",
              stringFilter: { matchType: "EXACT", value: "Organic Search" },
            },
          },
        ],
      },
    });
  });
});
