import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkingHoursSection from "./WorkingHoursSection";
import { endTimesOn, startTimesOn, summariseHours, type WorkingHours } from "@/lib/working-hours";

jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/service/auth/auth.service", () => ({ AuthService: { me: jest.fn(), updateWorkingHours: jest.fn() } }));

import { AuthService } from "@/service/auth/auth.service";
import { toast } from "react-toastify";

const nineToFive = { open: "09:00", close: "17:00" };
const week: WorkingHours = { mon: nineToFive, tue: nineToFive, wed: nineToFive, thu: nineToFive, fri: nineToFive, sat: null, sun: null };

describe("working hours helpers", () => {
  it("summarises the week", () => {
    expect(summariseHours(week)).toBe("Mon–Fri 9am–5pm");
    expect(summariseHours({ ...week, sat: { open: "10:00", close: "24:00" } })).toBe("Mon–Fri 9am–5pm · Sat 10am–midnight");
    expect(summariseHours(null)).toBeNull();
  });

  it("lists start and end times inside a day's hours", () => {
    // 2030-06-03 is a Monday
    expect(startTimesOn(week, "2030-06-03")?.slice(-2)).toEqual(["16:00", "16:30"]);
    expect(endTimesOn(week, "2030-06-03", "16:00")).toEqual(["16:30", "17:00"]);
    expect(startTimesOn(week, "2030-06-02")).toEqual([]); // Sunday: closed
    expect(startTimesOn(null, "2030-06-03")).toBeNull(); // no hours: any time
  });
});

describe("WorkingHoursSection", () => {
  beforeEach(() => {
    (AuthService.updateWorkingHours as jest.Mock).mockResolvedValue({ data: { success: true } });
    jest.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("starts from Mon–Fri 9–5 when nothing is set, and saves all 7 days", async () => {
    (AuthService.me as jest.Mock).mockResolvedValue({ data: { data: { working_hours: null } } });
    const user = userEvent.setup();
    render(<WorkingHoursSection />);
    expect(await screen.findByText(/Not set: customers can request any day and time/)).toBeInTheDocument();

    // open Saturdays 10am–2pm
    await user.click(screen.getByRole("switch", { name: "Open on Saturday" }));
    await user.selectOptions(screen.getByLabelText("Saturday opens"), "10:00");
    await user.selectOptions(screen.getByLabelText("Saturday closes"), "14:00");
    await user.click(screen.getByRole("button", { name: "Save working hours" }));

    await waitFor(() => expect(AuthService.updateWorkingHours).toHaveBeenCalledWith({ ...week, sat: { open: "10:00", close: "14:00" } }));
    expect(await screen.findByText("Mon–Fri 9am–5pm · Sat 10am–2pm")).toBeInTheDocument();
  });

  it("closes a day and only offers closing times after the opening", async () => {
    (AuthService.me as jest.Mock).mockResolvedValue({ data: { data: { working_hours: week } } });
    const user = userEvent.setup();
    render(<WorkingHoursSection />);
    await screen.findByText("Mon–Fri 9am–5pm");

    const closes = screen.getByLabelText("Monday closes") as HTMLSelectElement;
    expect(Array.from(closes.options)[0].value).toBe("09:30");
    expect(Array.from(closes.options).at(-1)?.value).toBe("24:00");

    // moving the opening past the close pushes the close along
    await user.selectOptions(screen.getByLabelText("Tuesday opens"), "18:00");
    expect(screen.getByLabelText("Tuesday closes")).toHaveValue("18:30");

    await user.click(screen.getByRole("switch", { name: "Open on Friday" }));
    expect(screen.queryByLabelText("Friday opens")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save working hours" }));
    await waitFor(() =>
      expect(AuthService.updateWorkingHours).toHaveBeenCalledWith({ ...week, tue: { open: "18:00", close: "18:30" }, fri: null }),
    );
  });

  it("removes the hours", async () => {
    (AuthService.me as jest.Mock).mockResolvedValue({ data: { data: { working_hours: week } } });
    const user = userEvent.setup();
    render(<WorkingHoursSection />);
    await user.click(await screen.findByRole("button", { name: "Remove hours" }));
    await waitFor(() => expect(AuthService.updateWorkingHours).toHaveBeenCalledWith(null));
    expect(await screen.findByText(/Not set/)).toBeInTheDocument();
  });

  it("shows the server's reason when saving fails", async () => {
    (AuthService.me as jest.Mock).mockResolvedValue({ data: { data: { working_hours: null } } });
    (AuthService.updateWorkingHours as jest.Mock).mockResolvedValue({ data: { success: false, message: "Monday: the closing time must be after the opening time." } });
    const user = userEvent.setup();
    render(<WorkingHoursSection />);
    await user.click(await screen.findByRole("button", { name: "Save working hours" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Monday: the closing time must be after the opening time."));
  });
});
