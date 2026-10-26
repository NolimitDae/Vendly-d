import { Fetch } from "../../lib/Fetch";

export interface Place {
  label: string;
  lat: number;
  lng: number;
}

/** Address suggestions while typing a location, and the place at a position. */
export const GeoService = {
  /** `street`: a full street address (labels with street and ZIP); otherwise towns and areas ("Smyrna, DE"). */
  suggest: async (q: string, near?: { lat: number; lng: number } | null, street = false) =>
    Fetch.get(`/geo/suggest?${new URLSearchParams({ q, ...(near ? { lat: String(near.lat), lng: String(near.lng) } : {}), ...(street ? { street: "1" } : {}) })}`),
  reverse: async (lat: number, lng: number) => Fetch.get(`/geo/reverse?${new URLSearchParams({ lat: String(lat), lng: String(lng) })}`),
};
