import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventStatusActions, { EventCancelledBanner, EventCompletedBanner, canEditEvent, eventActionsFor, isEventReadOnly } from "./EventStatusActions";
import EditEventDialog, { formValuesToUpdate } from "./EditEventDialog";

jest.mock("@/service/events/events.service", () => ({
  EventsService: { update: jest.fn(), cancel: jest.fn() },
}));
jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { EventsService } from "@/service/events/events.service";
import { toast } from "react-toastify";

const update = EventsService.update as jest.Mock;
const cancel = EventsService.cancel as jest.Mock;

const renderActions = (status: string) => {
  const onUpdated = jest.fn();
  const onCancelled = jest.fn();
  render(<EventStatusActions eventId="e1" eventName="Okafor wedding" status={status} onUpdated={onUpdated} onCancelled={onCancelled} />);
  return { onUpdated, onCancelled };
};

describe("eventActionsFor / canEditEvent", () => {
  it("offers only the moves the API allows", () => {
    expect(eventActionsFor("PLANNING")).toEqual(["IN_PROGRESS", "CANCEL"]);
    expect(eventActionsFor("CONFIRMED")).toEqual(["IN_PROGRESS", "CANCEL"]);
    expect(eventActionsFor("IN_PROGRESS")).toEqual(["COMPLETED", "CANCEL"]);
    expect(eventActionsFor("COMPLETED")).toEqual([]);
    expect(eventActionsFor("CANCELLED")).toEqual([]);
  });

  it("lets the planner edit until the event is completed or cancelled", () => {
    expect(canEditEvent("PLANNING")).toBe(true);
    expect(canEditEvent("IN_PROGRESS")).toBe(true);
    expect(canEditEvent("COMPLETED")).toBe(false);
    expect(canEditEvent("CANCELLED")).toBe(false);
  });

  it("treats only a cancelled event as read-only (a completed one can still get tasks and files)", () => {
    expect(isEventReadOnly("CANCELLED")).toBe(true);
    expect(isEventReadOnly("COMPLETED")).toBe(false);
    expect(isEventReadOnly("PLANNING")).toBe(false);
  });
});

describe("EventStatusActions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows Mark in progress and Cancel for a planning event", () => {
    renderActions("PLANNING");
    expect(screen.getByRole("button", { name: /mark in progress/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel event/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark completed/i })).toBeNull();
  });

  it("shows Mark completed and Cancel for an event in progress", () => {
    renderActions("IN_PROGRESS");
    expect(screen.getByRole("button", { name: /mark completed/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel event/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark in progress/i })).toBeNull();
  });

  it.each(["COMPLETED", "CANCELLED"])("shows no actions for a %s event", (status) => {
    renderActions(status);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("marks the event in progress", async () => {
    update.mockResolvedValue({ data: { success: true, data: { id: "e1", status: "IN_PROGRESS" } } });
    const { onUpdated } = renderActions("PLANNING");

    await userEvent.click(screen.getByRole("button", { name: /mark in progress/i }));

    await waitFor(() => expect(update).toHaveBeenCalledWith("e1", { status: "IN_PROGRESS" }));
    expect(onUpdated).toHaveBeenCalledWith({ id: "e1", status: "IN_PROGRESS" });
    expect(toast.success).toHaveBeenCalledWith("Event marked in progress");
  });

  it("asks before marking completed, then marks it", async () => {
    update.mockResolvedValue({ data: { success: true, data: { id: "e1", status: "COMPLETED" } } });
    const { onUpdated } = renderActions("IN_PROGRESS");

    await userEvent.click(screen.getByRole("button", { name: /mark completed/i }));
    const dialog = screen.getByRole("alertdialog");
    expect(update).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: /mark completed/i }));

    await waitFor(() => expect(update).toHaveBeenCalledWith("e1", { status: "COMPLETED" }));
    expect(onUpdated).toHaveBeenCalledWith({ id: "e1", status: "COMPLETED" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("shows the API's reason when a status change is refused", async () => {
    update.mockRejectedValue({ response: { data: { message: "Cannot transition from COMPLETED to PLANNING" } } });
    const { onUpdated } = renderActions("PLANNING");

    await userEvent.click(screen.getByRole("button", { name: /mark in progress/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Cannot transition from COMPLETED to PLANNING"));
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it("explains that bookings are not cancelled, and keeps the event when dismissed", async () => {
    const { onCancelled } = renderActions("PLANNING");

    await userEvent.click(screen.getByRole("button", { name: /cancel event/i }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/vendor bookings are not cancelled/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/cancel each booking you no longer need/i)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: /keep event/i }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(cancel).not.toHaveBeenCalled();
    expect(onCancelled).not.toHaveBeenCalled();
  });

  it("cancels the event after confirming", async () => {
    cancel.mockResolvedValue({ data: { success: true, data: { id: "e1", status: "CANCELLED" } } });
    const { onCancelled } = renderActions("IN_PROGRESS");

    await userEvent.click(screen.getByRole("button", { name: /cancel event/i }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: /^cancel event$/i }));

    await waitFor(() => expect(cancel).toHaveBeenCalledWith("e1"));
    expect(onCancelled).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a failed cancel and stays put", async () => {
    cancel.mockRejectedValue(new Error("network"));
    const { onCancelled } = renderActions("PLANNING");

    await userEvent.click(screen.getByRole("button", { name: /cancel event/i }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: /^cancel event$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to cancel event"));
    expect(onCancelled).not.toHaveBeenCalled();
  });
});

describe("EventCompletedBanner", () => {
  it("shows the completion date and links to bookings for reviews", async () => {
    const onViewVendors = jest.fn();
    render(<EventCompletedBanner completedAt="2026-11-15T10:00:00Z" hasBookings onViewVendors={onViewVendors} />);

    expect(screen.getByText("Completed on Nov 15, 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /review vendors/i })).toHaveAttribute("href", "/bookings");
    await userEvent.click(screen.getByRole("button", { name: /view vendors/i }));
    expect(onViewVendors).toHaveBeenCalled();
  });

  it("skips the review prompt when the event had no vendors", () => {
    render(<EventCompletedBanner completedAt="2026-11-15T10:00:00Z" hasBookings={false} onViewVendors={jest.fn()} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("EventCancelledBanner", () => {
  it("shows when it was cancelled and that it's read-only", () => {
    render(<EventCancelledBanner cancelledAt="2026-10-02T09:00:00Z" />);
    expect(screen.getByText("Cancelled on Oct 2, 2026")).toBeInTheDocument();
    expect(screen.getByText(/nothing can be added or changed/)).toBeInTheDocument();
  });
});

describe("EditEventDialog", () => {
  beforeEach(() => jest.clearAllMocks());

  const event = {
    id: "e1",
    name: "Okafor wedding",
    type: "WEDDING",
    date: "2026-11-14T16:00:00.000Z",
    venue: "Grand Ballroom",
    guest_count: 120,
    total_budget: "15000.00",
    notes: "Outdoor ceremony",
  };

  it("prefills the form and saves changed details, clearing emptied fields", async () => {
    update.mockResolvedValue({ data: { success: true, data: { ...event, name: "Okafor reception", venue: null } } });
    const onSaved = jest.fn();
    const onClose = jest.fn();
    render(<EditEventDialog event={event} onClose={onClose} onSaved={onSaved} />);

    const name = screen.getByLabelText(/event name/i);
    expect(name).toHaveValue("Okafor wedding");
    expect(screen.getByLabelText(/venue/i)).toHaveValue("Grand Ballroom");
    expect(screen.getByLabelText(/guest count/i)).toHaveValue(120);
    expect(screen.getByLabelText(/event type/i)).toHaveValue("WEDDING");

    await userEvent.clear(name);
    await userEvent.type(name, "Okafor reception");
    await userEvent.clear(screen.getByLabelText(/venue/i));
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    const [id, body] = update.mock.calls[0];
    expect(id).toBe("e1");
    expect(body).toMatchObject({
      name: "Okafor reception",
      type: "WEDDING",
      venue: null,
      guest_count: 120,
      total_budget: 15000,
      notes: "Outdoor ceremony",
    });
    expect(new Date(body.date).toISOString()).toBe("2026-11-14T16:00:00.000Z");
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ name: "Okafor reception" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("uses the create form's validation", async () => {
    render(<EditEventDialog event={event} onClose={jest.fn()} onSaved={jest.fn()} />);

    await userEvent.clear(screen.getByLabelText(/event name/i));
    await userEvent.type(screen.getByLabelText(/event name/i), "A");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Name must be at least 2 characters")).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it("maps empty optional fields to null", () => {
    expect(formValuesToUpdate({ name: " Party ", type: "", date: "", venue: " ", guest_count: "", total_budget: "", notes: "" })).toEqual({
      name: "Party",
      type: null,
      date: null,
      venue: null,
      guest_count: null,
      total_budget: null,
      notes: null,
    });
  });
});
