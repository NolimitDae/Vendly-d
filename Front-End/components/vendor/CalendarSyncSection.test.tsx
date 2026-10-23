import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CalendarSyncSection from "./CalendarSyncSection";

jest.mock("@/service/vendor/calendar-sync.service", () => ({
  CalendarSyncService: { get: jest.fn(), regenerateFeed: jest.fn(), setImport: jest.fn(), syncNow: jest.fn(), removeImport: jest.fn() },
}));
jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { CalendarSyncService } from "@/service/vendor/calendar-sync.service";
import { toast } from "react-toastify";

const FEED = "https://api.test/api/calendar/feed/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG.ics";
const info = (imp: Record<string, unknown> = {}, feed = FEED) => ({
  data: {
    success: true,
    data: {
      feed_url: feed,
      import: { connected: false, url_hint: null, last_synced_at: null, last_sync_attempt_at: null, last_sync_error: null, busy_count: 0, ...imp },
    },
  },
});

describe("CalendarSyncSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.confirm = jest.fn(() => true);
    (CalendarSyncService.get as jest.Mock).mockResolvedValue(info());
  });

  it("shows the private feed link with Google and Apple instructions, and copies it", async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<CalendarSyncSection />);
    expect(await screen.findByLabelText(/your calendar feed link/i)).toHaveValue(FEED);
    expect(screen.getByText(/add calendar → from url/i)).toBeInTheDocument();
    expect(screen.getByText(/new calendar subscription/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /copy link/i }));
    expect(writeText).toHaveBeenCalledWith(FEED);
    expect(await screen.findByRole("button", { name: /copied/i })).toBeInTheDocument();
  });

  it("regenerates the link after confirming", async () => {
    const fresh = FEED.replace("abc", "xyz");
    (CalendarSyncService.regenerateFeed as jest.Mock).mockResolvedValue(info({}, fresh));
    render(<CalendarSyncSection />);
    await screen.findByLabelText(/your calendar feed link/i);
    await userEvent.click(screen.getByRole("button", { name: /new link/i }));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText(/your calendar feed link/i)).toHaveValue(fresh));
  });

  it("connects an import URL and shows its status", async () => {
    const user = userEvent.setup();
    (CalendarSyncService.setImport as jest.Mock).mockResolvedValue(
      info({ connected: true, url_hint: "calendar.google.com/…", last_synced_at: "2026-10-23T09:00:00.000Z", busy_count: 3 }),
    );
    render(<CalendarSyncSection />);
    await user.type(await screen.findByLabelText(/calendar ical address/i), "https://calendar.google.com/calendar/ical/x/private-y/basic.ics");
    await user.click(screen.getByRole("button", { name: /connect calendar/i }));
    expect(CalendarSyncService.setImport).toHaveBeenCalledWith("https://calendar.google.com/calendar/ical/x/private-y/basic.ics");
    expect(await screen.findByText("calendar.google.com/…")).toBeInTheDocument();
    expect(screen.getByText(/3 upcoming busy times/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sync now/i })).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalled();
  });

  it("shows the server's reason when a calendar can't be connected", async () => {
    const user = userEvent.setup();
    (CalendarSyncService.setImport as jest.Mock).mockRejectedValue({ response: { data: { message: "That calendar address points to a private network." } } });
    render(<CalendarSyncSection />);
    await user.type(await screen.findByLabelText(/calendar ical address/i), "https://10.0.0.1/cal.ics");
    await user.click(screen.getByRole("button", { name: /connect calendar/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("That calendar address points to a private network."));
    expect(screen.getByRole("button", { name: /connect calendar/i })).toBeInTheDocument();
  });

  it("shows the last sync error, syncs now and removes the calendar", async () => {
    const user = userEvent.setup();
    (CalendarSyncService.get as jest.Mock).mockResolvedValue(
      info({ connected: true, url_hint: "p01-calendars.icloud.com/…", last_synced_at: "2026-10-22T09:00:00.000Z", last_sync_attempt_at: "2026-10-23T09:00:00.000Z", last_sync_error: "The calendar took too long to respond.", busy_count: 2 }),
    );
    (CalendarSyncService.syncNow as jest.Mock).mockResolvedValue(info({ connected: true, url_hint: "p01-calendars.icloud.com/…", last_synced_at: "2026-10-23T10:00:00.000Z", busy_count: 2 }));
    (CalendarSyncService.removeImport as jest.Mock).mockResolvedValue(info());
    render(<CalendarSyncSection />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/took too long to respond/i);
    await user.click(screen.getByRole("button", { name: /sync now/i }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith("Calendar synced");

    await user.click(screen.getByRole("button", { name: /remove/i }));
    expect(CalendarSyncService.removeImport).toHaveBeenCalled();
    expect(await screen.findByLabelText(/calendar ical address/i)).toBeInTheDocument();
  });

  it("renders nothing when the account can't use calendar sync", async () => {
    (CalendarSyncService.get as jest.Mock).mockRejectedValue({ response: { status: 403 } });
    const { container } = render(<CalendarSyncSection />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
