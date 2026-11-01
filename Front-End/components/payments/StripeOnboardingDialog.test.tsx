import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import StripeOnboardingDialog from "./StripeOnboardingDialog";
import { Fetch } from "@/lib/Fetch";

jest.mock("@/lib/Fetch", () => ({ Fetch: { post: jest.fn() } }));
jest.mock("@/helper/cookie.helper", () => ({ CookieHelper: { get: () => "token-1" } }));
const loadConnectAndInitialize = jest.fn();
jest.mock("@stripe/connect-js/pure", () => ({ loadConnectAndInitialize: (o: any) => loadConnectAndInitialize(o) }));
jest.mock("@stripe/react-connect-js", () => ({
  ConnectComponentsProvider: ({ children }: any) => <div data-testid="provider">{children}</div>,
  ConnectAccountOnboarding: ({ onExit }: any) => <button onClick={onExit}>stripe-onboarding</button>,
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

  it("shows the server's reason when payout setup can't open", async () => {
    post.mockRejectedValue({ response: { data: { message: "Payouts are for vendors." } } });
    render(<StripeOnboardingDialog onClose={jest.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Payouts are for vendors.");
    expect(loadConnectAndInitialize).not.toHaveBeenCalled();
  });

  it("says so when the site has no Stripe key", async () => {
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    render(<StripeOnboardingDialog onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("not configured"));
    expect(post).not.toHaveBeenCalled();
  });
});
