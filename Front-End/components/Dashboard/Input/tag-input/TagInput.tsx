import React, { useState, useRef, useEffect } from "react";
import { inputStyles } from "./tokens/variant";
import { useControllableState } from "@/hooks";

export const TagInput = ({
  label,
  value: valueProp,
  defaultValue = [],
  onChange,
  options = [],
  size,
  variant,
  disabled,
  error,
  placeholder,
}: any) => {
  const [value, setValue] = useControllableState<string[]>(
    valueProp,
    defaultValue,
    onChange
  );
  
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const tags = value || [];

  const filtered = options.filter(
    (opt: string) =>
      opt.toLowerCase().includes(input.toLowerCase()) && !tags.includes(opt),
  );

  const addTag = (tag: string) => {
    setValue([...tags, tag]);
    setInput("");
    setOpen(false);
  };

  const removeTag = (tag: string) => {
    setValue(tags.filter((t: string) => t !== tag));
  };

  return (
    <div className="flex flex-col gap-1 w-full relative" ref={wrapperRef}>
      {label && <label className="text-sm font-medium leading-[160%] text-blackColor mb-1">{label}</label>}

      <div
        className={inputStyles({
          size,
          variant,
          state: error ? "error" : disabled ? "disabled" : "default",
        }) + " flex-wrap"}
      >
        {/* TAGS */}
        {tags.map((tag: string) => (
          <div
            key={tag}
            className="flex items-center gap-2 text-blackColor bg-borderColor border border-borderColor px-[0.563rem] py-[0.563rem] rounded-full text-sm leading-[140%] tracking-[0.07px] whitespace-nowrap"
          >
            {tag}
            <button 
              type="button" 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                removeTag(tag);
              }}
              disabled={disabled}
              className="text-gray-500 hover:text-black transition-colors"
            >
              ✕
            </button>
          </div>
        ))}

        {/* INPUT */}
        <input
          value={input}
          disabled={disabled}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (!disabled) setOpen(true);
          }}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="flex-1 bg-transparent outline-none min-w-[50px]"
        />
      </div>

      {/* DROPDOWN */}
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 z-10 w-full mt-1 border border-gray-200 rounded-lg bg-white shadow-md max-h-60 overflow-y-auto">
          {filtered.map((opt: string) => (
            <div
              key={opt}
              onClick={() => addTag(opt)}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-100"
            >
              {opt}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};
