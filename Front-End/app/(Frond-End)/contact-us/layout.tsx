import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Contact us",
  description: "Questions about a booking, payments or selling on Vendly? Send us a message and the Vendly team will get back to you.",
  path: "/contact-us",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
