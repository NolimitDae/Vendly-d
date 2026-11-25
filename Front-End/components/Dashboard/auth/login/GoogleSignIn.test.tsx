import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/lib/session", () => ({ saveSession: jest.fn() }));
jest.mock("@/service/auth/auth.service", () => ({ AuthService: { social: jest.fn() } }));
import { AuthService } from "@/service/auth/auth.service";
import GoogleSignIn from "./GoogleSignIn";

/** Loads the component with a client ID set, and a fake Google script that signs in with "gtok". */
function setup() {
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "web-id.apps.googleusercontent.com";
  let signIn: (r: { credential: string }) => void = () => undefined;
  window.google = { accounts: { id: { initialize: (o: any) => (signIn = o.callback), renderButton: jest.fn() } } };
  render(<GoogleSignIn />);
  return { signIn: (t = "gtok") => act(() => signIn({ credential: t })) };
}

afterEach(() => {
  delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  delete (window as any).google;
  jest.clearAllMocks();
});

describe("GoogleSignIn", () => {
  it("shows nothing until the Google client ID is set", () => {
    const { container } = render(<GoogleSignIn />);
    expect(container).toBeEmptyDOMElement();
  });

  it("signs an existing account in and goes to its home", async () => {
    (AuthService.social as jest.Mock).mockResolvedValue({ data: { success: true, type: "VENDOR", authorization: { access_token: "a" } } });
    const { signIn } = setup();
    signIn();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/vendor"));
    expect(AuthService.social).toHaveBeenCalledWith({ provider: "google", id_token: "gtok" });
  });

  it("asks a new account how it will use Vendly and for the terms, then creates it", async () => {
    (AuthService.social as jest.Mock)
      .mockResolvedValueOnce({ data: { success: false, needs_role: true } })
      .mockResolvedValueOnce({ data: { success: true, type: "CLIENT", authorization: { access_token: "a" } } });
    const user = userEvent.setup();
    const { signIn } = setup();
    signIn();
    await user.click(await screen.findByRole("button", { name: /i'm booking/i }));
    const create = screen.getByRole("button", { name: /create my account/i });
    expect(create).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    await user.click(create);
    await waitFor(() => expect(AuthService.social).toHaveBeenLastCalledWith({ provider: "google", id_token: "gtok", role: "CLIENT", accepted_terms: true }));
    expect(push).toHaveBeenCalledWith("/marketplace");
  });

  it("asks for the authenticator code on an account with two-step sign-in", async () => {
    (AuthService.social as jest.Mock)
      .mockRejectedValueOnce({ response: { data: { message: "Token is required" } } })
      .mockResolvedValueOnce({ data: { success: true, type: "CLIENT", authorization: { access_token: "a" } } });
    const user = userEvent.setup();
    const { signIn } = setup();
    signIn();
    await user.type(await screen.findByLabelText("Authenticator code"), "123456");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(AuthService.social).toHaveBeenLastCalledWith({ provider: "google", id_token: "gtok", token: "123456" }));
  });
});
