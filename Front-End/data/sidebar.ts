import {
  OverviewIcon,
  VendorsIcon,
  EventPlannersIcon,
  BookingIcon,
  TransactionsIcon,
  ServicesIcon,
  SettingIcon,
  PrivacyPolicyIcon,
  LogoutIcon,
} from "@/icons";
import PendingApprovalIcon from "@/icons/PendingApprovalIcon";
import MessageIcon from "@/icons/MessageIcon";
import WalletIcon from "@/icons/WalletIcon";

interface NavItem {
  icon: any;
  label: string;
  href: string;
  type?: "client" | "admin" | "candidate" | "vendor" | "event_planner";
  children?: NavItem[];
}

const item = (
  label: string,
  href: string,
  icon: any,
  extra: Partial<NavItem> = {},
): NavItem => ({ icon, label, href, type: "admin", ...extra });

/** The admin menu, in labelled groups (Sidebar.tsx). */
export interface NavSection {
  title: string | null;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  { title: null, items: [item("Overview", "/dashboard", OverviewIcon)] },
  {
    title: "People",
    items: [
      item("Vendors", "/dashboard/vendors", VendorsIcon, {
        children: [
          {
            label: "All Vendors",
            href: "/dashboard/vendors",
            icon: EventPlannersIcon,
          },
          {
            label: "Pending Requests",
            href: "/dashboard/vendors/pending-requests",
            icon: PendingApprovalIcon,
          },
        ],
      }),
      item("Event Planners", "/dashboard/event-planners", EventPlannersIcon, {
        children: [
          {
            label: "All Event Planners",
            href: "/dashboard/event-planners",
            icon: EventPlannersIcon,
          },
          {
            label: "Pending Requests",
            href: "/dashboard/event-planners/pending-requests",
            icon: PendingApprovalIcon,
          },
        ],
      }),
      item("ID checks", "/dashboard/identity", PendingApprovalIcon),
    ],
  },
  {
    title: "Marketplace",
    items: [
      item("Listings", "/dashboard/listings", ServicesIcon),
      item("Bookings", "/dashboard/bookings", BookingIcon),
      item("Contracts", "/dashboard/contracts", PrivacyPolicyIcon),
    ],
  },
  {
    title: "Money",
    items: [
      item("Transactions", "/dashboard/transactions", TransactionsIcon),
      item("Revenue", "/dashboard/revenue", TransactionsIcon),
      item("Wallet", "/wallet", WalletIcon),
    ],
  },
  {
    title: "Reviews & reports",
    items: [
      item("Disputes", "/dashboard/disputes", PendingApprovalIcon),
      item("Fee reviews", "/dashboard/fee-reviews", PendingApprovalIcon),
      item("Chat reports", "/dashboard/chat-reports", MessageIcon),
    ],
  },
  {
    title: "Admin controls",
    items: [
      item("Settings", "/dashboard/settings", SettingIcon),
      item("Service categories", "/dashboard/services", ServicesIcon),
      item("Promo codes", "/dashboard/promos", WalletIcon),
      item("Privacy Policy", "/dashboard/privacy", PrivacyPolicyIcon),
    ],
  },
  {
    title: "Vendor & planner pages",
    items: [
      item("Earnings", "/vendor/earnings", TransactionsIcon, {
        type: "vendor",
      }),
      item("Subscription", "/vendor/subscription", WalletIcon, {
        type: "vendor",
      }),
      item("Planner dashboard", "/event-planner/dashboard", OverviewIcon, {
        type: "event_planner",
      }),
      item("My Events", "/event-planner/events", EventPlannersIcon, {
        type: "event_planner",
      }),
      item("My Profile", "/event-planner/profile", BookingIcon, {
        type: "event_planner",
      }),
    ],
  },
  { title: "Account", items: [item("Messages", "/chat", MessageIcon)] },
];

/** Every menu link, in menu order. */
export const navItems: NavItem[] = navSections.flatMap((s) => s.items);

/** Signing out, at the foot of the menu. */
export const otherItems = [
  {
    icon: LogoutIcon,
    label: "Logout",
    href: "/logout",
    type: "admin",
  },
];
