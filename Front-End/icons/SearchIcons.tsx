import React, { memo } from "react";

// HighlightedText — matches query substring and wraps in <mark>
interface HighlightedTextProps {
    text: string;
    query: string;
}

export const HighlightedText = memo(function HighlightedText({
    text,
    query,
}: HighlightedTextProps) {
    if (!query.trim()) return <>{text}</>;

    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");
    const parts = text.split(regex);

    return (
        <>
            {parts.map((part, i) =>
                regex.test(part) ? (
                    <mark
                        key={i}
                        className="bg-[var(--si-highlight-bg)] text-[var(--si-highlight-text)] rounded-[2px] px-[1px]"
                    >
                        {part}
                    </mark>
                ) : (
                    <React.Fragment key={i}>{part}</React.Fragment>
                )
            )}
        </>
    );
});

// Icons
export const SearchIcon = memo(function SearchIcon({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#4A4C56"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={className}
        >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
        </svg>
    );
});

export const ClearIcon = memo(function ClearIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#4A4C56"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
        >
            <path d="M18 6 6 18M6 6l12 12" />
        </svg>
    );
});

export const LoadingSpinner = memo(function LoadingSpinner() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#4A4C56"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
            className="animate-spin"
        >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    );
});