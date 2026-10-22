/** Names and home pages for the roles one login can switch between. */
export const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: "Customer",
  CLIENT: "Customer",
  VENDOR: "Vendor",
  EVENT_PLANNER: "Event planner",
};

export const ROLE_BLURB: Record<string, string> = {
  CUSTOMER: "Find and book vendors for your events.",
  VENDOR: "List your services and take bookings.",
  EVENT_PLANNER: "Plan events for clients and book vendors for them.",
};

/** Where each role lands after login or a switch. */
export function homeFor(type?: string | null) {
  if (type === "ADMIN") return "/dashboard";
  if (type === "VENDOR") return "/vendor/listings";
  if (type === "EVENT_PLANNER") return "/event-planner/profile";
  return "/marketplace";
}
