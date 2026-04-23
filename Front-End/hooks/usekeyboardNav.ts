import { useCallback, useEffect, useState } from "react";
import type {
    UseKeyboardNavOptions,
    UseKeyboardNavReturn,
} from "../types/index";

export function useKeyboardNav({
    isOpen,
    itemCount,
    onSelect,
    onClose,
    inputRef,
}: UseKeyboardNavOptions): UseKeyboardNavReturn {
    const [activeIndex, setActiveIndex] = useState(-1);

    const resetIndex = useCallback(() => setActiveIndex(-1), []);

    useEffect(() => {
        if (!isOpen) resetIndex();
    }, [isOpen, resetIndex]);

    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;

        const handler = (e: KeyboardEvent) => {
            if (!isOpen) return;

            switch (e.key) {
                case "ArrowDown":
                    e.preventDefault();
                    setActiveIndex((prev) => (prev + 1) % itemCount);
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    setActiveIndex((prev) => (prev <= 0 ? itemCount - 1 : prev - 1));
                    break;
                case "Enter":
                    if (activeIndex >= 0) {
                        e.preventDefault();
                        onSelect(activeIndex);
                    }
                    break;
                case "Escape":
                    e.preventDefault();
                    onClose();
                    break;
                case "Tab":
                    onClose();
                    break;
            }
        };

        el.addEventListener("keydown", handler);
        return () => el.removeEventListener("keydown", handler);
    }, [isOpen, itemCount, activeIndex, onSelect, onClose, inputRef]);

    return { activeIndex, resetIndex };
}