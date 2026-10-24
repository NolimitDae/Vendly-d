import { renderHook, waitFor } from "@testing-library/react";
import { useFeature, useFeatureOptIn } from "./useFeature";

jest.mock("@/lib/Fetch", () => ({ Fetch: { get: jest.fn() } }));
import { Fetch } from "@/lib/Fetch";

// The flags are fetched once per page load (a failed request is tried again), so these run in order.
describe("feature flags", () => {
  it("a failed request keeps opt-in features off, and other features on", async () => {
    (Fetch.get as jest.Mock).mockRejectedValue(new Error("offline"));
    const plans = renderHook(() => useFeatureOptIn("subscriptions"));
    expect(plans.result.current).toBeUndefined(); // loading
    await waitFor(() => expect(plans.result.current).toBe(false));
    expect(renderHook(() => useFeature("rentals")).result.current).toBe(true);
  });

  it("opt-in features are on only once an admin switches them on; others are on unless switched off", async () => {
    (Fetch.get as jest.Mock).mockResolvedValue({ data: { data: ["subscriptions"], disabled: ["rentals"] } });
    const plans = renderHook(() => useFeatureOptIn("subscriptions"));
    await waitFor(() => expect(plans.result.current).toBe(true));
    const unknown = renderHook(() => useFeatureOptIn("something_new"));
    await waitFor(() => expect(unknown.result.current).toBe(false));
    const rentals = renderHook(() => useFeature("rentals"));
    await waitFor(() => expect(rentals.result.current).toBe(false));
    expect(renderHook(() => useFeature("chat")).result.current).toBe(true);
    expect(Fetch.get).toHaveBeenCalledWith("/flags");
  });
});
