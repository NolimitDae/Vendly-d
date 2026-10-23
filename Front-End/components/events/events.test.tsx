import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RunOfShow from "./RunOfShow";
import type { TimelineItem } from "@/service/events/eventTools.service";

jest.mock("@/service/events/eventTools.service", () => ({
  ...jest.requireActual("@/service/events/eventTools.service"),
  EventToolsService: { updateTimeline: jest.fn().mockResolvedValue({ data: { success: true } }), addTimeline: jest.fn().mockResolvedValue({ data: { success: true } }), deleteTimeline: jest.fn() },
}));
jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { EventToolsService } from "@/service/events/eventTools.service";

const items: TimelineItem[] = [
  { id: "t1", starts_at: "2026-11-14T13:00:00", title: "Hair & makeup", vendor_id: "v1", vendor: { id: "v1", name: "Nia Glam" }, done: false },
  { id: "t2", starts_at: "2026-11-14T16:00:00", ends_at: "2026-11-14T16:45:00", title: "Ceremony", vendor_id: null, vendor: null, done: false },
];

describe("RunOfShow", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lets a vendor tick off only their own items", async () => {
    const onChanged = jest.fn();
    render(<RunOfShow eventId="e1" eventDate="2026-11-14" role="vendor" userId="v1" items={items} vendors={[]} onChanged={onChanged} />);
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mark hair & makeup done/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark ceremony done/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /add to the run of show/i })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /mark hair & makeup done/i }));
    await waitFor(() => expect(EventToolsService.updateTimeline).toHaveBeenCalledWith("e1", "t1", { done: true }));
    expect(onChanged).toHaveBeenCalled();
  });

  it("is read-only for the client", () => {
    render(<RunOfShow eventId="e1" eventDate="2026-11-14" role="client" items={items} vendors={[]} onChanged={jest.fn()} />);
    expect(screen.getByText("Ceremony")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("hides every change on a cancelled event, even for the planner", () => {
    render(<RunOfShow eventId="e1" eventDate="2026-11-14" role="planner" items={items} vendors={[]} onChanged={jest.fn()} readOnly />);
    expect(screen.getByText("Ceremony")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("lets the planner add an item for a booked vendor", async () => {
    const user = userEvent.setup();
    render(<RunOfShow eventId="e1" eventDate="2026-11-14" role="planner" items={[]} vendors={[{ id: "v1", name: "Nia Glam" }]} onChanged={jest.fn()} />);
    await user.click(screen.getByRole("button", { name: /add to the run of show/i }));
    const time = document.querySelector('input[type="time"]') as HTMLInputElement;
    await user.type(time, "14:00");
    await user.type(screen.getByLabelText("Title"), "Load-in");
    await user.selectOptions(screen.getByLabelText("Who runs it"), "v1");
    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() => expect(EventToolsService.addTimeline).toHaveBeenCalledWith("e1", expect.objectContaining({ title: "Load-in", vendor_id: "v1" })));
  });
});
