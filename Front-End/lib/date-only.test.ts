import { dateOnly } from "./date-only";

describe("dateOnly", () => {
  const parts = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()];

  it("keeps the calendar day of a date-only value, whatever the time zone", () => {
    expect(parts(dateOnly("2026-12-20T00:00:00.000Z"))).toEqual([2026, 12, 20, 0]);
    expect(parts(dateOnly("2026-12-20"))).toEqual([2026, 12, 20, 0]);
    expect(parts(dateOnly("2027-01-01T00:00:00.000Z"))).toEqual([2027, 1, 1, 0]);
  });
});
