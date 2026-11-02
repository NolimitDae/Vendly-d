import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import StripeOnboardingDialog from "./StripeOnboardingDialog";
import { Fetch } from "@/lib/Fetch";

jest.mock("@/lib/Fetch", () => ({ Fetch: { post: jest.fn(), get: jest.fn() } }));
jest.mock("@/helper/cookie.helper", () => ({ CookieHelper: { get: () => "token-1" } }));
const loadConnectAndInitialize = jest.fn();
jest.mock("@stripe/connect-js/pure", () => ({ loadConnectAndInitialize: (o: any) => loadConnectAndInitialize(o) }));
jest.mock("@stripe/react-connect-js", () => ({
  ConnectComponentsProvider: ({ children }: any) => <div data-testid="provider">{children}</div>,
  ConnectAccountOnboarding: ({ onExit }: any) => <button onClick={onExit}>stripe-onboarding</button>,
  ConnectAccountManagement: () => <div>stripe-account-management</div>,
}));

const post = Fetch.post as jest.Mock;

describe("StripeOnboardingDialog", () => {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  beforeEach(() => (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_1"));
  afterAll(() => (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = key));

  it("opens Stripe's onboarding with the vendor's session, and closes when they leave it", async () => {
    post.mockResolvedValue({ data: { data: { clientSecret: "accs_secret_1" } } });
    loadConnectAndInitialize.mockReturnValue({});
    const onClose = jest.fn();
    render(<StripeOnboardingDialog onClose={onClose} />);

    fireEvent.click(await screen.findByText("stripe-onboarding"));
    expect(onClose).toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith("/withdraw/account-session", {}, expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer token-1" }) }));

    // the first secret is used once; an expired session asks the server for a new one
    const { publishableKey, fetchClientSecret } = loadConnectAndInitialize.mock.calls[0][0];
    expect(publishableKey).toBe("pk_test_1");
    expect(await fetchClientSecret()).toBe("accs_secret_1");
    post.mockResolvedValue({ data: { data: { clientSecret: "accs_secret_2" } } });
    expect(await fetchClientSecret()).toBe("accs_secret_2");
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("shows Stripe's account management for a vendor who has finished setup", async () => {
    post.mockResolvedValue({ data: { data: { clientSecret: "accs_secret_1" } } });
    loadConnectAndInitialize.mockReturnValue({});
    render(<StripeOnboardingDialog onClose={jest.fn()} manage />);
    expect(await screen.findByText("stripe-account-management")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Payout details" })).toBeInTheDocument();
    expect(screen.queryByText("stripe-onboarding")).not.toBeInTheDocument();
  });

  it("shows the server's reason when payout setup is refused, with no way around it", async () => {
    post.mockRejectedValue({ response: { status: 403, data: { message: "Payouts are for vendors." } } });
    render(<StripeOnboardingDialog onClose={jest.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Payouts are for vendors.");
    expect(loadConnectAndInitialize).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /continue on stripe/i })).not.toBeInTheDocument();
  });

  it("offers Stripe's own setup page when the embedded form can't open", async () => {
    post.mockRejectedValueOnce({ response: { status: 500, data: { message: "Could not open payout setup. Please try again later." } } });
    (Fetch.get as jest.Mock).mockResolvedValue({ data: { data: { accountId: "acct_1" } } });
    post.mockResolvedValueOnce({ data: { data: { url: "https://connect.stripe.com/setup/x" } } });
    // jsdom can't navigate; it only reports that it was asked to
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    render(<StripeOnboardingDialog onClose={jest.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /continue on stripe/i }));
    await waitFor(() => expect(post).toHaveBeenLastCalledWith("/withdraw/onboarding/acct_1", {}, expect.anything()));
    // an existing account is reused, not made again
    expect(post).not.toHaveBeenCalledWith("/withdraw/create-connected-account", {}, expect.anything());
    spy.mockRestore();
  });

  it("says so when the site has no Stripe key", async () => {
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    render(<StripeOnboardingDialog onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("not configured"));
    expect(post).not.toHaveBeenCalled();
  });
});
