import { fireEvent, render, screen } from "@testing-library/react";
import DepositPlanFields, { appendDepositTerms, depositTermsError, depositTermsFrom, emptyDepositTerms } from "./DepositPlanFields";

describe("a package's own deposit", () => {
  it("checks the percentage and the balance timing", () => {
    expect(depositTermsError("DEPOSIT_CUSTOM", { percent: "25", days: "", afterService: true })).toBeNull();
    expect(depositTermsError("DEPOSIT_CUSTOM", { percent: "5", days: "7", afterService: true })).toMatch(/10% to 90%/);
    expect(depositTermsError("DEPOSIT_CUSTOM", { percent: "40", days: "0", afterService: false })).toMatch(/1 to 60 days/);
    // other plans have nothing to check
    expect(depositTermsError("DEPOSIT_50", { percent: "", days: "", afterService: false })).toBeNull();
  });

  it("sends its numbers only for a custom deposit, and the days only when the balance is before the event", () => {
    const after = new FormData();
    appendDepositTerms(after, "DEPOSIT_CUSTOM", { percent: "50", days: "7", afterService: true });
    expect(Object.fromEntries(after.entries())).toEqual({ deposit_percent: "50", balance_after_service: "true" });

    const before = new FormData();
    appendDepositTerms(before, "DEPOSIT_CUSTOM", { percent: "30", days: "10", afterService: false });
    expect(Object.fromEntries(before.entries())).toEqual({ deposit_percent: "30", balance_after_service: "false", balance_due_days: "10" });

    const other = new FormData();
    appendDepositTerms(other, "FULL_ON_ACCEPT", emptyDepositTerms());
    expect([...other.keys()]).toEqual([]);
  });

  it("loads a saved package's numbers", () => {
    expect(depositTermsFrom({ deposit_percent: 40, balance_due_days: 10, balance_after_service: false })).toEqual({ percent: "40", days: "10", afterService: false });
    expect(depositTermsFrom({})).toEqual(emptyDepositTerms());
  });

  it("shows only for the custom plan, with quick 25% / 50% picks and a plain summary", () => {
    const onChange = jest.fn();
    const { rerender } = render(<DepositPlanFields plan="DEPOSIT_50" value={emptyDepositTerms()} onChange={onChange} />);
    expect(screen.queryByText("Deposit when you accept")).toBeNull();

    rerender(<DepositPlanFields plan="DEPOSIT_CUSTOM" value={{ percent: "25", days: "7", afterService: true }} onChange={onChange} />);
    expect(screen.getByText(/the rest/).textContent).toMatch(/25% when you accept and the rest after the service/);
    fireEvent.click(screen.getByRole("button", { name: "50%" }));
    expect(onChange).toHaveBeenCalledWith({ percent: "50", days: "7", afterService: true });
  });
});
