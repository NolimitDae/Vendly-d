import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import LicenceNotice, { canPublish } from "./LicenceNotice";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, className }: any) => <a href={href} className={className}>{children}</a>,
}));
jest.mock("@/service/auth/auth.service", () => ({ AuthService: { me: jest.fn() } }));
import { AuthService } from "@/service/auth/auth.service";

const me = (data: object) => (AuthService.me as jest.Mock).mockResolvedValue({ data: { success: true, data: { type: "VENDOR", ...data } } });

describe("LicenceNotice", () => {
  it("follows the API's rule", () => {
    expect(canPublish("APPROVED")).toBe(true);
    expect(canPublish("NOT_APPLICABLE")).toBe(true);
    expect(canPublish("PENDING")).toBe(false);
    expect(canPublish("SUSPENDED")).toBe(false);
    expect(canPublish(null)).toBe(false);
  });

  it("asks a vendor with no licence to upload one, and says drafts still save", async () => {
    me({ license_status: "PENDING", license_uploaded: false });
    render(<LicenceNotice />);
    expect(await screen.findByText(/You need an approved business licence to publish packages\. You can still save drafts\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload your licence" })).toHaveAttribute("href", "/vendor/profile#licence");
  });

  it("says the licence is in review once it has been sent", async () => {
    me({ license_status: "PENDING", license_uploaded: true });
    render(<LicenceNotice things="rental items" />);
    expect(await screen.findByText(/Vendly is reviewing your business licence\. You can save rental items as drafts now/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View your licence" })).toBeInTheDocument();
  });

  it("asks for it again when it needs attention", async () => {
    me({ license_status: "SUSPENDED", license_uploaded: true });
    render(<LicenceNotice />);
    expect(await screen.findByText(/needs attention/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload your licence" })).toBeInTheDocument();
  });

  it("shows nothing to approved vendors, vendors who need no licence, or other accounts", async () => {
    for (const data of [{ license_status: "APPROVED" }, { license_status: "NOT_APPLICABLE" }, { type: "CUSTOMER", license_status: null }]) {
      me(data);
      const { container, unmount } = render(<LicenceNotice />);
      await waitFor(() => expect(AuthService.me).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});
