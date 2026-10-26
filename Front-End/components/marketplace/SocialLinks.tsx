import { Globe } from "lucide-react";
import { SiFacebook, SiInstagram, SiTiktok, SiX, SiYoutube } from "react-icons/si";
import type { ComponentType } from "react";

export type SocialKey = "website" | "instagram" | "tiktok" | "facebook" | "youtube" | "x";
export type SocialLinksData = Partial<Record<SocialKey, string | null>>;

/** The social accounts a vendor can add, in the order they're shown. */
export const SOCIALS: { key: SocialKey; label: string; placeholder: string; Icon: ComponentType<{ className?: string }> }[] = [
  { key: "website", label: "Website", placeholder: "yourbusiness.com", Icon: Globe },
  { key: "instagram", label: "Instagram", placeholder: "@yourbusiness", Icon: SiInstagram },
  { key: "tiktok", label: "TikTok", placeholder: "@yourbusiness", Icon: SiTiktok },
  { key: "facebook", label: "Facebook", placeholder: "facebook.com/yourbusiness", Icon: SiFacebook },
  { key: "youtube", label: "YouTube", placeholder: "@yourbusiness", Icon: SiYoutube },
  { key: "x", label: "X", placeholder: "@yourbusiness", Icon: SiX },
];

/** A vendor's social accounts as round icon links; nothing when none are set. */
export default function SocialLinks({ socials, className = "" }: { socials?: SocialLinksData | null; className?: string }) {
  // the server only stores https links; anything else is skipped rather than linked
  const items = SOCIALS.filter(({ key }) => socials?.[key]?.startsWith("https://"));
  if (!items.length) return null;
  return (
    <ul className={`flex flex-wrap items-center gap-2 ${className}`} aria-label="Social accounts">
      {items.map(({ key, label, Icon }) => (
        <li key={key}>
          <a
            href={socials![key]!}
            target="_blank"
            rel="noopener noreferrer nofollow"
            aria-label={label}
            title={label}
            className="flex items-center justify-center w-9 h-9 rounded-full border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:text-primary hover:border-primary transition"
          >
            <Icon className="w-4 h-4" />
          </a>
        </li>
      ))}
    </ul>
  );
}
