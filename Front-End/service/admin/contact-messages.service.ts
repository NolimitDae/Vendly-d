import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const json = () => ({
  headers: {
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
    "Content-Type": "application/json",
  },
});

/** A message sent from the website's Contact us form. */
export interface ContactMessage {
  id: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone_number: string | null;
  message: string | null;
}

export const ContactMessagesService = {
  list: (q?: string) => Fetch.get(`/admin/contact${q ? `?${new URLSearchParams({ q })}` : ""}`, json()),
  remove: (id: string) => Fetch.delete(`/admin/contact/${id}`, json()),
};
