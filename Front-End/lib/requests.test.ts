import { closesIn, vendorAnswersWithin } from "./requests";

const now = Date.parse("2026-10-23T12:00:00Z");
const inHours = (h: number) => new Date(now + h * 3_600_000).toISOString();

describe("request countdown", () => {
  it("tells the vendor when the request closes", () => {
    expect(closesIn(inHours(22.5), now)).toBe("Closes in 22 hours");
    expect(closesIn(inHours(0.25), now)).toBe("Closes in 15 minutes");
  });

  it("tells the customer how long the vendor has to answer", () => {
    expect(vendorAnswersWithin(inHours(1.2), now)).toBe("The vendor has 1 hour to answer");
    expect(vendorAnswersWithin(inHours(48), now)).toBe("The vendor has 48 hours to answer");
  });

  it("says nothing once the time is up or there is no deadline", () => {
    expect(vendorAnswersWithin(inHours(-1), now)).toBeNull();
    expect(vendorAnswersWithin(null, now)).toBeNull();
  });
});
