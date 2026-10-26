import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BookingProgress from "./BookingProgress";
import BookingContact from "./BookingContact";
import MapPicture from "./MapPicture";
import VendorDayPanel from "./VendorDayPanel";

jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/lib/session", () => ({ ...jest.requireActual("@/lib/session"), isLoggedIn: () => true }));
jest.mock("@/service/chat/chat.service", () => ({ ChatService: { createConversation: jest.fn() } }));
jest.mock("@/service/booking/booking.service", () => ({
  BookingService: { trackerStep: jest.fn(), startWork: jest.fn(), complete: jest.fn() },
}));
import { BookingService } from "@/service/booking/booking.service";

describe("BookingProgress", () => {
  it("shows each step, which are done and when", () => {
    render(<BookingProgress booking={{ status: "CONFIRMED", confirmed_at: "2026-11-14T10:00:00Z", en_route_at: "2026-11-14T14:05:00Z" }} />);
    const items = screen.getAllByRole("listitem");
    ["Confirmed", "On the way", "Arrived", "In progress", "Done"].forEach((label, i) => expect(items[i]).toHaveTextContent(label));
    expect(items[1]).toHaveTextContent("Nov 14");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[1]).toHaveTextContent("(done)");
    expect(items[2]).toHaveTextContent("(not yet)");
  });
});

describe("BookingContact", () => {
  const person = { id: "u1", name: "Sam Sounds" };
  it("offers Call only when a number came back", () => {
    const { rerender } = render(<BookingContact person={person} role="Vendor" phone="+1 (512) 555-0134" />);
    expect(screen.getByRole("link", { name: /Call Sam Sounds/ })).toHaveAttribute("href", "tel:+15125550134");
    expect(screen.getByRole("button", { name: "Message Sam Sounds" })).toBeInTheDocument();
    rerender(<BookingContact person={person} role="Vendor" phone={null} />);
    expect(screen.queryByRole("link", { name: /Call/ })).toBeNull();
  });
});

describe("MapPicture", () => {
  it("draws tiles from the API with a credit, and links to directions", () => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 400 });
    const { container } = render(<MapPicture lat={30.2672} lng={-97.7431} address="1 Main St" directions />);
    const tiles = container.querySelectorAll("img");
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles[0].getAttribute("src")).toMatch(/^\/api\/geo\/tile\/15\/\d+\/\d+$/);
    expect(screen.getByRole("img", { name: /1 Main St/ })).toBeInTheDocument();
    expect(screen.getByText("© OpenStreetMap contributors")).toBeInTheDocument();
    const dir = screen.getByRole("link", { name: "Directions" });
    expect(dir).toHaveAttribute("href", "https://www.google.com/maps/dir/?api=1&destination=30.2672%2C-97.7431");
    expect(dir).toHaveAttribute("target", "_blank");
  });

  it("shows nothing without a position or directions", () => {
    const { container } = render(<MapPicture lat={null} lng={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("VendorDayPanel", () => {
  beforeEach(() => jest.clearAllMocks());

  it("takes the next step on the day, next to Start booking", async () => {
    (BookingService.trackerStep as jest.Mock).mockResolvedValue({ data: { success: true } });
    const onChanged = jest.fn();
    render(<VendorDayPanel booking={{ id: "b1", status: "CONFIRMED", steps_open: true }} customerName="Ana Lee" onChanged={onChanged} />);
    expect(screen.getByRole("button", { name: "Start booking" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "On my way" }));
    await waitFor(() => expect(BookingService.trackerStep).toHaveBeenCalledWith("b1", "en-route"));
    expect(onChanged).toHaveBeenCalled();
  });

  it("says when the steps open, and offers Mark as completed once started", () => {
    const { rerender } = render(<VendorDayPanel booking={{ id: "b1", status: "CONFIRMED", steps_open: false }} customerName="Ana" onChanged={jest.fn()} />);
    expect(screen.queryByRole("button", { name: "On my way" })).toBeNull();
    expect(screen.getByText(/show up here the day before/)).toBeInTheDocument();
    rerender(<VendorDayPanel booking={{ id: "b1", status: "IN_PROGRESS", arrived_at: "2026-11-14T14:05:00Z" }} customerName="Ana" onChanged={jest.fn()} />);
    expect(screen.getByRole("button", { name: "Mark as completed" })).toBeInTheDocument();
    expect(screen.getByText(/You arrived at/)).toBeInTheDocument();
  });
});
