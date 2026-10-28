import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

/** A saved vendor as the favorites page shows it (no contact details or business address). */
export interface SavedVendor {
  id: string;
  created_at: string;
  vendor: {
    id: string;
    name: string;
    business_name?: string | null;
    handle?: string | null;
    avatar_url?: string | null;
    logo_url?: string | null;
    location?: string | null;
    categories: string[];
    listing_count: number;
    avg_rating?: number | null;
    review_count: number;
    is_test?: boolean;
  };
}

export const SavedVendorsService = {
  /** Saved vendors that are still on the marketplace, newest first */
  getAll: async () => Fetch.get("/saved-vendors", authHeaders()),

  /** Array of vendor IDs the user has saved — fast, used to pre-fill hearts */
  getSavedIds: async () => Fetch.get("/saved-vendors/ids", authHeaders()),

  /** Save (heart) a vendor */
  save: async (vendorId: string) =>
    Fetch.post(`/saved-vendors/${encodeURIComponent(vendorId)}`, {}, authHeaders()),

  /** Unsave (unheart) a vendor */
  remove: async (vendorId: string) =>
    Fetch.delete(`/saved-vendors/${encodeURIComponent(vendorId)}`, authHeaders()),
};
