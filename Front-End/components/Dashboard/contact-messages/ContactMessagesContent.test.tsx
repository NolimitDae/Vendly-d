import { render, screen } from "@testing-library/react";
import ContactMessagesContent from "./ContactMessagesContent";
import { ContactMessagesService } from "@/service/admin/contact-messages.service";

jest.mock("@/service/admin/contact-messages.service", () => ({ ContactMessagesService: { list: jest.fn(), remove: jest.fn() } }));
jest.mock("react-toastify", () => ({ toast: { error: jest.fn() } }));

describe("contact messages", () => {
  it("lists what people sent, with a reply link to each sender", async () => {
    (ContactMessagesService.list as jest.Mock).mockResolvedValue({
      data: { success: true, data: [{ id: "c1", created_at: "2026-11-01T12:00:00Z", first_name: "Ada", last_name: "Obi", email: "ada@example.com", phone_number: null, message: "Can I change my booking date?" }] },
    });
    render(<ContactMessagesContent />);
    expect(await screen.findByText("Ada Obi")).toBeInTheDocument();
    expect(screen.getByText("Can I change my booking date?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Reply/ }).getAttribute("href")).toMatch(/^mailto:ada@example\.com/);
    expect(screen.getByText("support@vendlymarketplace.com")).toBeInTheDocument();
  });
});
