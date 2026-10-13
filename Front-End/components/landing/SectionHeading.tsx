import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  body?: string;
  tone?: "light" | "dark";
  align?: "center" | "left";
  id?: string;
}

/** Eyebrow + headline + intro used by every landing section. */
export default function SectionHeading({ eyebrow, title, body, tone = "light", align = "center", id }: SectionHeadingProps) {
  const dark = tone === "dark";
  return (
    <div data-reveal className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      <p className={cn("text-xs font-semibold uppercase tracking-[0.3em]", dark ? "text-orchid-300" : "text-plum-500 dark:text-orchid-300")}>{eyebrow}</p>
      <h2 id={id} className={cn("mt-4 text-4xl font-extrabold leading-[1.08] tracking-[-0.02em] sm:text-5xl", dark ? "text-white" : "text-plum-900 dark:text-white")}>
        {title}
      </h2>
      {body && <p className={cn("mt-5 text-lg leading-relaxed", dark ? "text-white/70" : "text-ink-600 dark:text-white/70")}>{body}</p>}
    </div>
  );
}
