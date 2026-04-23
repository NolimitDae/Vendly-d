import React, { useMemo } from "react";
import { HighlightedText } from "../../../icons/SearchIcons";
import type { DropdownProps, SearchResult } from "../../../types/index";
import { cn } from "@/lib/utils";

export function SearchDropdown<T extends SearchResult>({
    id,
    items,
    activeIndex,
    status,
    error,
    query,
    groupBy,
    renderResult,
    renderEmpty,
    renderLoading,
    renderError,
    onSelect,
    className,
}: DropdownProps<T>) {
    const grouped = useMemo(() => {
        if (!groupBy) return null;
        const map = new Map<string, T[]>();
        for (const item of items) {
            const key = groupBy(item);
            const existing = map.get(key) ?? [];
            map.set(key, [...existing, item]);
        }
        return map;
    }, [items, groupBy]);

    const content = useMemo(() => {
        if (status === "loading") {
            return renderLoading ? (
                renderLoading()
            ) : (
                <div className="px-4 py-6 flex items-center justify-center gap-2 text-[var(--si-placeholder)] text-sm">
                    <span
                        className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
                        aria-hidden
                    />
                    Searching…
                </div>
            );
        }

        if (status === "error" && error) {
            return renderError ? (
                renderError(error)
            ) : (
                <div className="px-4 py-5 text-[var(--si-error)] text-sm flex items-start gap-2">
                    <span aria-hidden className="mt-0.5 text-base leading-none">⚠</span>
                    <span>{error.message || "Something went wrong. Please try again."}</span>
                </div>
            );
        }

        if (items.length === 0 && query.length > 0) {
            return renderEmpty ? (
                renderEmpty(query)
            ) : (
                <div className="px-4 py-6 text-center text-[var(--si-placeholder)] text-sm">
                    No results for{" "}
                    <span className="text-[var(--si-text)] font-medium">"{query}"</span>
                </div>
            );
        }

        if (grouped) {
            let flatIndex = 0;
            return Array.from(grouped.entries()).map(([group, groupItems]) => (
                <div key={group} role="group" aria-label={group}>
                    <div className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--si-placeholder)]">
                        {group}
                    </div>
                    {groupItems.map((item) => {
                        const idx = flatIndex++;
                        return (
                            <ResultItem
                                key={item.id}
                                id={`${id}-option-${idx}`}
                                item={item}
                                index={idx}
                                isActive={activeIndex === idx}
                                query={query}
                                renderResult={renderResult}
                                onSelect={onSelect}
                            />
                        );
                    })}
                </div>
            ));
        }

        return items.map((item, idx) => (
            <ResultItem
                key={item.id}
                id={`${id}-option-${idx}`}
                item={item}
                index={idx}
                isActive={activeIndex === idx}
                query={query}
                renderResult={renderResult}
                onSelect={onSelect}
            />
        ));
    }, [
        status, error, items, query, grouped, id,
        activeIndex, renderResult, renderEmpty, renderLoading, renderError, onSelect,
    ]);

    return (
        <div
            id={id}
            role="listbox"
            aria-label="Search results"
            className={cn(
                "absolute top-full left-0 right-0 z-50 mt-1.5",
                "bg-[var(--si-bg)] border border-[var(--si-border)]",
                "rounded-xl shadow-lg overflow-hidden",
                "max-h-80 overflow-y-auto",
                "animate-in fade-in-0 slide-in-from-top-1 duration-100",
                className
            )}
        >
            {content}
        </div>
    );
}

interface ResultItemProps<T extends SearchResult> {
    id: string;
    item: T;
    index: number;
    isActive: boolean;
    query: string;
    renderResult?: (item: T, query: string) => React.ReactNode;
    onSelect: (item: T) => void;
}

function ResultItem<T extends SearchResult>({
    id,
    item,
    isActive,
    query,
    renderResult,
    onSelect,
}: ResultItemProps<T>) {
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault(); // Prevent blur before select
        onSelect(item);
    };

    if (renderResult) {
        return (
            <div
                id={id}
                role="option"
                aria-selected={isActive}
                onMouseDown={handleMouseDown}
                className={cn(
                    "cursor-pointer select-none",
                    isActive && "bg-[var(--si-active-bg)]"
                )}
            >
                {renderResult(item, query)}
            </div>
        );
    }

    return (
        <div
            id={id}
            role="option"
            aria-selected={isActive}
            onMouseDown={handleMouseDown}
            className={cn(
                "flex items-center gap-3 px-3 py-2.5",
                "cursor-pointer select-none",
                "transition-colors duration-75",
                isActive
                    ? "bg-[var(--si-active-bg)]"
                    : "hover:bg-gray-100"
            )}
        >
            {item.icon && (
                <span className="shrink-0 text-[var(--si-icon)] w-4 h-4 flex items-center justify-center">
                    {item.icon}
                </span>
            )}
            <div className="min-w-0 flex-1">
                <div className="text-[14px] text-[var(--si-text)] truncate leading-snug">
                    <HighlightedText text={item.label} query={query} />
                </div>
                {item.description && (
                    <div className="text-[12px] text-[var(--si-placeholder)] truncate mt-0.5">
                        {item.description}
                    </div>
                )}
            </div>
            {item._isRecent && (
                <span className="shrink-0 text-[10px] text-[var(--si-placeholder)] uppercase tracking-wider">
                    Recent
                </span>
            )}
        </div>
    );
}