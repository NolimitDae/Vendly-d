import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProfileContent from "./ProfileContent";

jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/service/auth/auth.service", () => ({ AuthService: { me: jest.fn(), updateProfile: jest.fn() } }));

import { AuthService } from "@/service/auth/auth.service";
import { toast } from "react-toastify";

const admin = { name: "Ada Admin", first_name: "Ada", last_name: "Admin", email: "ada@vendly.test", avatar_url: null };

beforeAll(() => {
  // jsdom has no object URLs (used for the photo preview)
  (URL as any).createObjectURL = jest.fn(() => "blob:preview");
  (URL as any).revokeObjectURL = jest.fn();
});

beforeEach(() => {
  (AuthService.me as jest.Mock).mockResolvedValue({ data: { success: true, data: admin } });
  (AuthService.updateProfile as jest.Mock).mockResolvedValue({ data: { success: true } });
});

const sent = () => {
  const fd = (AuthService.updateProfile as jest.Mock).mock.calls[0][0] as FormData;
  return { first: fd.get("first_name"), last: fd.get("last_name"), name: fd.get("name"), image: fd.get("image") };
};

describe("ProfileContent (admin Edit profile)", () => {
  it("loads the admin's details, with the email read-only", async () => {
    render(<ProfileContent />);
    expect(await screen.findByLabelText("First Name")).toHaveValue("Ada");
    expect(screen.getByLabelText("Last Name")).toHaveValue("Admin");
    expect(screen.getByLabelText("Email Address")).toHaveValue("ada@vendly.test");
    expect(screen.getByLabelText("Email Address")).toHaveAttribute("readonly");
  });

  it("saves the new name and photo and tells the header", async () => {
    const user = userEvent.setup();
    const onSaved = jest.fn();
    render(<ProfileContent onSaved={onSaved} />);

    const first = await screen.findByLabelText("First Name");
    await user.clear(first);
    await user.type(first, "Adaline");
    const photo = new File(["img"], "me.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Upload profile picture"), photo);
    expect(screen.getByRole("button", { name: "Remove new photo" })).toBeInTheDocument();

    (AuthService.me as jest.Mock).mockResolvedValue({ data: { success: true, data: { ...admin, name: "Adaline Admin", avatar_url: "https://cdn.test/a.png" } } });
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(AuthService.updateProfile).toHaveBeenCalledTimes(1));
    expect(sent()).toMatchObject({ first: "Adaline", last: "Admin", name: "Adaline Admin" });
    expect(sent().image).toBeInstanceOf(File);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ name: "Adaline Admin", email: "ada@vendly.test", avatar_url: "https://cdn.test/a.png" }));
    expect(toast.success).toHaveBeenCalledWith("Profile saved");
  });

  it("needs a first name", async () => {
    const user = userEvent.setup();
    render(<ProfileContent />);
    await user.clear(await screen.findByLabelText("First Name"));
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(AuthService.updateProfile).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Add your first name.");
  });

  it("shows the API's message when saving fails", async () => {
    const user = userEvent.setup();
    (AuthService.updateProfile as jest.Mock).mockResolvedValue({ data: { success: false, message: "Only JPEG, PNG, WebP or GIF images." } });
    render(<ProfileContent />);
    await screen.findByLabelText("First Name");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Only JPEG, PNG, WebP or GIF images."));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("refuses a photo over 5 MB before sending anything", async () => {
    const user = userEvent.setup();
    render(<ProfileContent />);
    await screen.findByLabelText("First Name");
    const big = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 6 * 1024 * 1024 });
    await user.upload(screen.getByLabelText("Upload profile picture"), big);
    expect(toast.error).toHaveBeenCalledWith("That photo is over 5 MB. Choose a smaller one.");
    expect(screen.queryByRole("button", { name: "Remove new photo" })).not.toBeInTheDocument();
  });
});
