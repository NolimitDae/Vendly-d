import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AppReviewLoginCard from "./AppReviewLoginCard";
import { TestDataService } from "@/service/admin/test-data.service";

jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("@/service/admin/test-data.service", () => ({ TestDataService: { reviewAccount: jest.fn() } }));

describe("AppReviewLoginCard", () => {
  it("makes the App Review login and shows its email and password once", async () => {
    (TestDataService.reviewAccount as jest.Mock).mockResolvedValue({ data: { data: { email: "appreview@vendlymarketplace.com", password: "ABCD-EFGH-JKLM-NPQR", note: "Paste it in App Store Connect." } } });
    const user = userEvent.setup();
    render(<AppReviewLoginCard />);
    await user.click(screen.getByRole("button", { name: "Make the App Review login" }));
    const box = await screen.findByTestId("app-review-login");
    expect(box).toHaveTextContent("appreview@vendlymarketplace.com");
    expect(box).toHaveTextContent("ABCD-EFGH-JKLM-NPQR");
    expect(screen.getByRole("button", { name: "Make a new password" })).toBeInTheDocument();
  });
});
