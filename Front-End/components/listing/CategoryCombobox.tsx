"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { categoryLabel, categoryRows, type CategoryRow, type PickerCategory } from "@/lib/categories";
import { cn } from "@/lib/utils";

/** A searchable category and sub-category picker for packages (type "DJ", "florist", "cake"...). */
export default function CategoryCombobox({
  categories,
  categoryId,
  subCategoryId,
  onChange,
}: {
  categories: PickerCategory[];
  categoryId: string;
  subCategoryId: string;
  onChange: (categoryId: string, subCategoryId: string) => void;
}) {
  const id = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rows = useMemo(() => categoryRows(categories, query), [categories, query]);
  const label = categoryLabel(categories, categoryId, subCategoryId);

  // keep the highlighted option in view while using the arrow keys
  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  const pick = (r: CategoryRow) => {
    onChange(r.categoryId, r.subId ?? "");
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && open) {
      e.preventDefault(); // don't submit the form
      if (rows[active]) pick(rows[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && rows[active] ? `${id}-opt-${active}` : undefined}
          aria-label="Category"
          value={open ? query : label}
          placeholder={label || "Search categories, e.g. DJ, florist, cake"}
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onBlur={() => {
            setOpen(false);
            setQuery("");
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          autoComplete="off"
          className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white"
        />
        {label && !open && (
          <button
            type="button"
            onClick={() => onChange("", "")}
            aria-label="Clear category"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && (
        <ul
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          aria-label="Categories"
          className="absolute z-20 mt-2 w-full max-h-72 overflow-auto rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1"
        >
          {rows.length === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
              {categories.length ? "Nothing matches. Try another word, or pick the closest category." : "No categories yet."}
            </li>
          ) : (
            rows.map((r, i) => {
              const selected = r.categoryId === categoryId && (r.subId ?? "") === (subCategoryId ?? "");
              return (
                <li
                  key={r.key}
                  id={`${id}-opt-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={selected}
                  // keep focus in the input so the click lands before the list closes
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(r)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex items-center gap-3 cursor-pointer py-2 pr-4",
                    r.subId ? "pl-8" : "pl-4",
                    i === active && "bg-gray-50 dark:bg-gray-700/60",
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm text-gray-900 dark:text-white truncate", !r.subId && "font-semibold")}>{r.title}</p>
                    {r.subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{r.subtitle}</p>}
                  </div>
                  {selected && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
