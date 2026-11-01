import { render, screen, waitFor } from "@testing-library/react";
import StripePayoutsPanel from "./StripePayoutsPanel";
import { Fetch } from "@/lib/Fetch";

jest.mock("@/lib/Fetch", () => ({ Fetch: { post: jest.fn(), get: jest.fn() } }));
jest.mock("@/helper/cookie.helper", () => ({ CookieHelper: { get: () => "token-1" } }));
jest.mock("@stripe/connect-js/pure", () => ({ loadConnectAndInitialize: () => ({}) }));
jest.mock("@stripe/react-connect-js", () => ({
  ConnectComponentsProvider: ({ children }: any) => <div>{children}</div>,
  ConnectNotificationBanner: () => <div>stripe-alerts</div>,
  ConnectPayouts: () => <div>stripe-payouts</div>,
}));

const post = Fetch.post as jest.Mock;

describe("StripePayoutsPanel", () => {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  beforeEach(() => (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_1"));
  afterAll(() => (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = key));

  it("shows Stripe's alerts and the payouts to the vendor's bank", async () => {
    post.mockResolvedValue({ data: { data: { clientSecret: "accs_1" } } });
    render(<StripePayoutsPanel />);
    expect(await screen.findByText("stripe-payouts")).toBeInTheDocument();
    expect(screen.getByText("stripe-alerts")).toBeInTheDocument();
    expect(screen.getByText("Bank payouts")).toBeInTheDocument();
  });

  it("leaves the page as it was when Stripe's components can't open", async () => {
    post.mockRejectedValue({ response: { status: 500, data: { message: "no permission" } } });
    const { container } = render(<StripePayoutsPanel />);
    await waitFor(() => expect(post).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
