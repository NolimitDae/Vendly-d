import type { Metadata } from "next";
import { JsonLd, missingMetadata, pageMetadata, publicData, SITE_URL, snippet } from "@/lib/seo";

type Props = { params: Promise<{ id: string }>; children: React.ReactNode };

const planner = async (params: Props["params"]) => publicData(`/event-planner/planners/${encodeURIComponent((await params).id)}`);
const nameOf = (p: any) => p?.business_name || p?.user?.name || "Event planner";

/** Search results and link previews show the planner's name, bio and photo. */
export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const data = await planner(params);
  if (data === null) return missingMetadata("Event planner not found");
  if (!data) return {};
  const name = nameOf(data);
  return pageMetadata({
    title: `${name}, event planner`,
    description: snippet(data.bio || `See ${name}'s experience and portfolio, and get in touch about your event on Vendly.`),
    path: `/event-planner/${data.user_id}`,
    image: data.portfolio?.[0] || data.user?.avatar_url,
  });
}

export default async function PlannerLayout({ params, children }: Props) {
  const data = await planner(params);
  const sameAs = data ? [data.website, data.instagram].filter((s: unknown): s is string => typeof s === "string" && /^https?:\/\//.test(s)) : [];
  return (
    <>
      {data && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ProfessionalService",
            name: nameOf(data),
            url: `${SITE_URL}/event-planner/${data.user_id}`,
            ...(data.bio ? { description: snippet(data.bio, 500) } : {}),
            ...(data.user?.avatar_url || data.portfolio?.[0] ? { image: data.user?.avatar_url || data.portfolio[0] } : {}),
            ...(sameAs.length ? { sameAs } : {}),
          }}
        />
      )}
      {children}
    </>
  );
}
