import { typingLabel } from "./presence";

/** "Ana is typing…" with three bouncing dots, shown at the foot of the message list. */
export default function TypingIndicator({ names }: { names: string[] }) {
  const label = typingLabel(names);
  return (
    <div aria-live="polite" className="min-h-6 flex items-center gap-2 px-1 pt-1 text-xs text-gray-500 dark:text-gray-400">
      {label && (
        <>
          <span className="flex gap-0.5" aria-hidden>
            {[0, 150, 300].map((delay) => (
              <span key={delay} className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: `${delay}ms` }} />
            ))}
          </span>
          <span>{label}</span>
        </>
      )}
    </div>
  );
}
