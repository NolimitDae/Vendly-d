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

interface NavItem {
  icon: any;
  label: string;
  href: string;
  type?: "client" | "admin" | "candidate";
  children?: NavItem[];
}

export const navItems: NavItem[] = [
  {
    icon: OverviewIcon,
    label: "Overview",
    href: "/dashboard",
    type: "admin",
  },
  {
    icon: VendorsIcon,
    label: "Vendors",
    href: "/vendors",
    type: "admin",
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
  },

  {
    icon: EventPlannersIcon,
    label: "Event Planners",
    href: "/event-planners",
    type: "admin",
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
  },
  {
    icon: BookingIcon,
    label: "Bookings",
    href: "/dashboard/bookings",
    type: "admin",
  },
  {
    icon: TransactionsIcon,
    label: "Transactions",
    href: "/dashboard/transactions",
    type: "admin",
  },
  {
    icon: ServicesIcon,
    label: "Services",
    href: "/dashboard/services",
    type: "admin",
  },
];

export const otherItems = [
  {
    icon: SettingIcon,
    label: "Settings",
    href: "/dashboard/settings",
    type: "admin",
  },
  {
    icon: PrivacyPolicyIcon,
    label: "Privacy Policy",
    href: "/dashboard/privacy",
    type: "admin",
  },
  {
    icon: LogoutIcon,
    label: "Logout",
    href: "/logout",
    type: "admin",
  },
];
