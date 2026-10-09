import { Fragment } from "react";

/** Renders contract text (# title, ## heading, - bullet, paragraphs) as plain React elements. */
export default function ContractBody({ body }: { body: string }) {
  const lines = body.split("\n");
  return (
    <div className="text-[15px] leading-relaxed text-gray-800 dark:text-gray-200">
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (line.startsWith("# "))
          return (
            <h2 key={i} className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {line.slice(2)}
            </h2>
          );
        if (line.startsWith("## "))
          return (
            <h3 key={i} className="font-semibold text-gray-900 dark:text-white mt-5 mb-1">
              {line.slice(3)}
            </h3>
          );
        if (line.startsWith("- "))
          return (
            <p key={i} className="pl-4 relative before:content-['•'] before:absolute before:left-0">
              {line.slice(2)}
            </p>
          );
        if (!line.trim()) return <Fragment key={i}><div className="h-2" /></Fragment>;
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}
