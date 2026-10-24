import { nextDay, toIso } from "./BookingModal";

// Jest runs in one time zone, so these check the calendar logic; the point of using calendar days
// (not 24 hours) is the clocks-change days, e.g. 1 November 2026 is 25 hours long in New York.
describe("booking times across midnight", () => {
  it("moves to the next calendar day", () => {
    expect(nextDay("2026-11-01")).toBe("2026-11-02");
    expect(nextDay("2026-03-08")).toBe("2026-03-09");
    expect(nextDay("2026-02-28")).toBe("2026-03-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
  });

  it("reads 24:00 as midnight at the start of the next day", () => {
    expect(toIso("2026-11-01", "24:00")).toBe(new Date("2026-11-02T00:00").toISOString());
    expect(toIso("2026-06-01", "18:30")).toBe(new Date("2026-06-01T18:30").toISOString());
  });
});
