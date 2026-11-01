import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Event planners",
  description: "Find an event planner for your wedding, birthday, corporate event or party. See their experience, portfolio and event types, and get in touch on Vendly.",
  path: "/event-planner",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
