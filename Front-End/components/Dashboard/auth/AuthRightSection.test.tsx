import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuthRightSection from "./AuthRightSection";

describe("AuthRightSection", () => {
  afterEach(() => jest.useRealTimers());

  it("moves to the next slide every few seconds, and the dashes jump to one", async () => {
    jest.useFakeTimers();
    render(<AuthRightSection />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    act(() => jest.advanceTimersByTime(6000));
    expect(screen.getAllByRole("tab")[1]).toHaveAttribute("aria-selected", "true");
    jest.useRealTimers();
    await userEvent.setup().click(screen.getByRole("tab", { name: /plan whole events/i }));
    expect(screen.getByRole("tab", { name: /plan whole events/i })).toHaveAttribute("aria-selected", "true");
  });

  it("stays put while the pointer is over it", async () => {
    jest.useFakeTimers();
    const { container } = render(<AuthRightSection />);
    act(() => {
      container.firstElementChild!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    act(() => jest.advanceTimersByTime(12000));
    expect(screen.getAllByRole("tab")[0]).toHaveAttribute("aria-selected", "true");
  });
});
