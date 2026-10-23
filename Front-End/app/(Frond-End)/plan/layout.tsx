import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Plan your event",
  description: "A checklist of the services your event needs, a budget split, when to book, and vendors on Vendly who are free.",
};

export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
