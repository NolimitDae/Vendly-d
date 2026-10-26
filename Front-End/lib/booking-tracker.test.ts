import { directionsUrl, nextVendorStep, phoneProblem, telLink, tilesAround, toTile, trackerSteps } from "./booking-tracker";

describe("trackerSteps", () => {
  it("follows the vendor's steps with their times", () => {
    const steps = trackerSteps({ status: "CONFIRMED", confirmed_at: "2026-11-14T10:00:00Z", en_route_at: "2026-11-14T14:00:00Z" });
    expect(steps.map((s) => s.label)).toEqual(["Confirmed", "On the way", "Arrived", "In progress", "Done"]);
    expect(steps.map((s) => s.done)).toEqual([true, true, false, false, false]);
    expect(steps[1].at).toBe("2026-11-14T14:00:00Z");
  });

  it("counts skipped steps as done once the booking is past them", () => {
    expect(trackerSteps({ status: "IN_PROGRESS" }).map((s) => s.done)).toEqual([true, true, true, true, false]);
    expect(trackerSteps({ status: "COMPLETED" }).every((s) => s.done)).toBe(true);
  });

  it("has a check-in instead of travel when the customer goes to the vendor", () => {
    const steps = trackerSteps({ status: "CONFIRMED", service_at: "VENDOR_LOCATION", checked_in_at: "2026-11-14T14:00:00Z" });
    expect(steps.map((s) => s.label)).toEqual(["Confirmed", "Checked in", "In progress", "Done"]);
    expect(steps.map((s) => s.done)).toEqual([true, true, false, false]);
  });
});

describe("nextVendorStep", () => {
  const today = { status: "CONFIRMED", steps_open: true };
  it("goes On my way → Arrived → nothing, only on the day", () => {
    expect(nextVendorStep(today)).toEqual({ path: "en-route", label: "On my way" });
    expect(nextVendorStep({ ...today, en_route_at: "x" })).toEqual({ path: "arrived", label: "Arrived" });
    expect(nextVendorStep({ ...today, en_route_at: "x", arrived_at: "y" })).toBeNull();
    expect(nextVendorStep({ ...today, steps_open: false })).toBeNull();
    expect(nextVendorStep({ ...today, status: "IN_PROGRESS" })).toBeNull();
    expect(nextVendorStep({ ...today, is_rental: true })).toBeNull();
  });

  it("has Customer arrived for packages at the vendor's place", () => {
    expect(nextVendorStep({ ...today, service_at: "VENDOR_LOCATION" })).toEqual({ path: "check-in", label: "Customer arrived" });
    expect(nextVendorStep({ ...today, service_at: "VENDOR_LOCATION", checked_in_at: "x" })).toBeNull();
  });
});

describe("contact and directions", () => {
  it("dials the digits and the plus", () => {
    expect(telLink("+1 (512) 555-0134")).toBe("tel:+15125550134");
  });

  it("checks phone numbers loosely", () => {
    expect(phoneProblem("")).toBeNull();
    expect(phoneProblem("+44 20 7946 0958")).toBeNull();
    expect(phoneProblem("12345")).toMatch(/7 to 20 digits/);
    expect(phoneProblem("555-CALL-NOW")).toMatch(/only digits/);
  });

  it("opens Google Maps directions to the position, else the address", () => {
    expect(directionsUrl({ lat: 30.27, lng: -97.74 })).toBe("https://www.google.com/maps/dir/?api=1&destination=30.27%2C-97.74");
    expect(directionsUrl({ address: "1 Main St, Austin" })).toBe("https://www.google.com/maps/dir/?api=1&destination=1%20Main%20St%2C%20Austin");
    expect(directionsUrl({})).toBeNull();
  });
});

describe("map tiles", () => {
  it("projects like every slippy map", () => {
    const t = toTile(0, 0, 1);
    expect(t).toEqual({ x: 1, y: 1 });
    // Austin at zoom 15 is in tile 7487/13491
    const a = toTile(30.2672, -97.7431, 15);
    expect([Math.floor(a.x), Math.floor(a.y)]).toEqual([7487, 13491]);
  });

  it("covers the box with tiles from the API, the point in the middle", () => {
    const tiles = tilesAround(30.2672, -97.7431, 600, 180);
    expect(tiles.length).toBeGreaterThanOrEqual(3);
    expect(tiles.every((t) => t.url.startsWith("/api/geo/tile/15/"))).toBe(true);
    // every tile overlaps the box
    expect(tiles.every((t) => t.left < 600 && t.left + 256 > 0 && t.top < 180 && t.top + 256 > 0)).toBe(true);
  });
});
