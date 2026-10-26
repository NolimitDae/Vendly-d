import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const json = () => ({
  headers: {
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
    "Content-Type": "application/json",
  },
});

export interface TestAccount {
  email: string;
  business_name: string | null;
  shop_url: string | null;
  packages?: number;
}

export interface TestDataStatus {
  accounts: TestAccount[];
  counts: { vendors: number; packages: number };
}

export interface TestDataCreated extends TestDataStatus {
  created: { vendors_created: number; packages_created: number; add_ons_created: number; contracts_created: number; rental_items_created: number };
  skipped: { email: string; reason: string }[];
  near: string;
  timezone: string;
  /** shown once; null when it didn't change */
  password: string | null;
  password_note: string;
}

export interface TestDataRemoved {
  removed: string[];
  kept: { email: string | null; reason: string }[];
  cancelled: { booking_id: string; package: string | null; status: string; refunded: number }[];
  not_cancelled: { booking_id: string; package: string | null; reason: string }[];
  counts: { removed: number; kept: number; cancelled: number; not_cancelled: number };
}

/** Admin → Settings → Test vendors. */
export const TestDataService = {
  status: () => Fetch.get("/admin/test-data", json()),
  /** near can be left out to use where the test vendors already are (e.g. only resetting the password) */
  create: (body: { near?: string; lat?: number; lng?: number; reset_password?: boolean }) => Fetch.post("/admin/test-data", body, json()),
  remove: () => Fetch.delete("/admin/test-data", json()),
};
