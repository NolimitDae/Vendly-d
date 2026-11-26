import { methodLabel } from "./SavedCards";

describe("methodLabel", () => {
  it("names cards, Apple Pay cards and bank accounts", () => {
    expect(methodLabel({ id: "a", brand: "visa", last4: "4242", is_default: false })).toBe("Visa •••• 4242");
    expect(methodLabel({ id: "b", brand: "visa", last4: "1111", wallet: "apple_pay", is_default: false })).toBe("Apple Pay · Visa •••• 1111");
    expect(methodLabel({ id: "c", type: "us_bank_account", last4: "6789", is_default: false })).toBe("Bank account •••• 6789");
  });
});
