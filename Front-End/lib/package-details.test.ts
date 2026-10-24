import { firstBookableDay, tooSoonMessage } from "./package-details";

describe("firstBookableDay", () => {
  const now = new Date("2030-06-03T15:00:00");

  it("skips a day whose midnight is still inside the notice", () => {
    // 24 hours from 3pm Monday is 3pm Tuesday: a booking on Tuesday without a start time would be refused
    expect(firstBookableDay(24, now)).toEqual(new Date("2030-06-05T00:00:00"));
    expect(tooSoonMessage(24, firstBookableDay(24, now), now)).toBeNull();
  });

  it("keeps the day when the notice ends exactly at midnight", () => {
    expect(firstBookableDay(9, now)).toEqual(new Date("2030-06-04T00:00:00"));
  });

  it("is today without a notice", () => {
    expect(firstBookableDay(null, now)).toEqual(new Date("2030-06-03T00:00:00"));
  });
});
