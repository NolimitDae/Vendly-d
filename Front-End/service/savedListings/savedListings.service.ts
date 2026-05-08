import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

export const SavedListingsService = {
  /** Full saved listing objects (with nested listing + vendor data) */
  getAll: async () => Fetch.get("/saved-listings", authHeaders()),

  /** Array of listing IDs the user has saved — fast, used to pre-fill hearts */
  getSavedIds: async () => Fetch.get("/saved-listings/ids", authHeaders()),

  /** Save (heart) a listing */
  save: async (listingId: string) =>
    Fetch.post(`/saved-listings/${listingId}`, {}, authHeaders()),

  /** Unsave (unheart) a listing */
  remove: async (listingId: string) =>
    Fetch.delete(`/saved-listings/${listingId}`, authHeaders()),
};
