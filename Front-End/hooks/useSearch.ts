import { useCallback, useEffect, useRef, useState } from "react";
import type {
    SearchResult,
    SearchStatus,
    UseSearchOptions,
    UseSearchReturn,
} from "../types/index";

export function useSearch<T extends SearchResult>({
    query,
    enabled,
    onSearch,
    maxResults,
    filterResults,
}: UseSearchOptions<T>): UseSearchReturn<T> {
    const [results, setResults] = useState<T[]>([]);
    const [status, setStatus] = useState<SearchStatus>("idle");
    const [error, setError] = useState<Error | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const cacheRef = useRef<Map<string, T[]>>(new Map());

    const execute = useCallback(async () => {
        if (!enabled) {
            setResults([]);
            setStatus("idle");
            return;
        }

        const cacheKey = query;
        if (cacheRef.current.has(cacheKey)) {
            setResults(cacheRef.current.get(cacheKey)!);
            setStatus("success");
            return;
        }

        abortRef.current?.abort();
        abortRef.current = new AbortController();

        setStatus("loading");
        setError(null);

        try {
            let raw = await onSearch(query);
            if (filterResults) raw = filterResults(raw, query);
            const trimmed = raw.slice(0, maxResults);
            cacheRef.current.set(cacheKey, trimmed);
            setResults(trimmed);
            setStatus("success");
        } catch (err) {
            if ((err as Error)?.name === "AbortError") return;
            setError(err instanceof Error ? err : new Error("Search failed"));
            setStatus("error");
            setResults([]);
        }
    }, [query, enabled, onSearch, maxResults, filterResults]);

    useEffect(() => {
        execute();
        return () => abortRef.current?.abort();
    }, [execute]);

    return { results, status, error };
}