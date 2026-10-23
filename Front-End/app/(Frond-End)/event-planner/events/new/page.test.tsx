import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NewEventPage from "./page";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("next/link", () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }));
jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/service/events/events.service", () => ({ EventsService: { create: jest.fn() } }));

import { EventsService } from "@/service/events/events.service";

describe("New event", () => {
  it("sends the exact moment the planner picked, not a time with no zone", async () => {
    (EventsService.create as jest.Mock).mockResolvedValue({ data: { success: true, data: { id: "e1" } } });
    const user = userEvent.setup();
    render(<NewEventPage />);
    await user.type(screen.getByLabelText(/Event Name/), "Okafor wedding");
    const date = screen.getByLabelText("Event Date") as HTMLInputElement;
    await user.clear(date);
    await user.type(date, "2027-06-12T18:30");
    await user.click(screen.getByRole("button", { name: /create event/i }));

    await waitFor(() => expect(EventsService.create).toHaveBeenCalled());
    const sent = (EventsService.create as jest.Mock).mock.calls[0][0];
    expect(sent.date).toBe(new Date("2027-06-12T18:30").toISOString());
    expect(push).toHaveBeenCalledWith("/event-planner/events/e1");
  });
});
