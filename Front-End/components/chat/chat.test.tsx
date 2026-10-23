import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QuoteCard from "./QuoteCard";
import { acceptPhotos, MAX_PHOTO_BYTES, sharesContact, type Quote } from "@/service/chat/chat.service";

const quote = (over: Partial<Quote> = {}): Quote => ({
  id: "q1",
  title: "Bridal party of 6",
  description: "Trial included",
  amount: 900,
  expires_at: "2030-01-01T00:00:00Z",
  status: "PENDING",
  vendor_id: "v1",
  customer_id: "c1",
  listing: { id: "l1", title: "Bridal Glam", image: null },
  ...over,
});

describe("sharesContact", () => {
  it("spots phone numbers, emails and off-platform payment asks", () => {
    expect(sharesContact("call me 713-555-0182")).toBe(true);
    expect(sharesContact("nia@gmail.com")).toBe(true);
    expect(sharesContact("just Zelle me")).toBe(true);
  });
  it("leaves prices, dates and counts alone", () => {
    expect(sharesContact("$1,250 for 2026-11-14, 120 guests")).toBe(false);
  });
});

describe("acceptPhotos", () => {
  const photo = (name: string, size = 1000, type = "image/jpeg") => {
    const f = new File(["x"], name, { type });
    Object.defineProperty(f, "size", { value: size });
    return f;
  };

  it("takes several photos at once, up to 10 in all", () => {
    const picked = Array.from({ length: 4 }, (_, i) => photo(`p${i}.jpg`));
    expect(acceptPhotos(0, picked)).toEqual({ files: picked, error: null });
    const res = acceptPhotos(8, picked);
    expect(res.files.map((f) => f.name)).toEqual(["p0.jpg", "p1.jpg"]);
    expect(res.error).toBe("You can send up to 10 photos at a time");
  });

  it("leaves out files that aren't photos or are too big", () => {
    const res = acceptPhotos(0, [photo("a.pdf", 10, "application/pdf"), photo("big.jpg", MAX_PHOTO_BYTES + 1), photo("ok.png", 10, "image/png")]);
    expect(res.files.map((f) => f.name)).toEqual(["ok.png"]);
    expect(res.error).toBe("Only photos can be sent. big.jpg is over 10 MB");
  });
});

describe("QuoteCard", () => {
  it("lets the customer accept or decline an open quote", async () => {
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    render(<QuoteCard quote={quote()} role="customer" onAccept={onAccept} onDecline={onDecline} onWithdraw={jest.fn()} />);
    expect(screen.getByText("$900.00")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /accept & book/i }));
    await userEvent.click(screen.getByRole("button", { name: /decline/i }));
    expect(onAccept).toHaveBeenCalled();
    expect(onDecline).toHaveBeenCalled();
  });

  it("gives the vendor a withdraw button and hides actions once settled", () => {
    const { rerender } = render(<QuoteCard quote={quote()} role="vendor" onAccept={jest.fn()} onDecline={jest.fn()} onWithdraw={jest.fn()} />);
    expect(screen.getByRole("button", { name: /withdraw/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /accept/i })).toBeNull();
    rerender(<QuoteCard quote={quote({ status: "ACCEPTED" })} role="customer" onAccept={jest.fn()} onDecline={jest.fn()} onWithdraw={jest.fn()} />);
    expect(screen.getByText(/booking requested/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
