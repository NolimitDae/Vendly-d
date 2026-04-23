import React, {
  forwardRef,
  memo,
  useCallback,
  useRef,
  useState,
  useId,
} from "react";
import {
  TextInputProps,
  TextareaProps,
  SelectInputProps,
  CheckboxProps,
  RadioGroupProps,
  FileInputProps,
  SelectOption,
} from "../types";
import { BaseInput } from "../base/BaseInput";
import { InputWrapper } from "../base/InputWrapper";
import {
  useInputId,
  useAutoResize,
  useControllableState,
  useFileDrop,
} from "@/hooks";
import {
  cn,
  sizeConfig,
  buildInputClass,
  buildLabelClass,
} from "../utils/variants";
import { UploadIcon } from "@/icons";

// ══════════════════════════════════════════════════════════════════════════════
// TextInput
// ══════════════════════════════════════════════════════════════════════════════

export const GenericInput = forwardRef<HTMLInputElement, TextInputProps>(
  function GenericInput(props, ref) {
    return <BaseInput ref={ref} {...props} />;
  },
);

// ══════════════════════════════════════════════════════════════════════════════
// Textarea
// ══════════════════════════════════════════════════════════════════════════════

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      id: providedId,
      name,
      label,
      error,
      helperText,
      successText,
      required,
      size = "md",
      variant = "outlined",
      fullWidth = false,
      wrapperClassName,
      labelClassName,
      inputClassName,
      errorClassName,
      helperClassName,
      autoResize = false,
      rows = 4,
      showCount = false,
      maxLength,
      disabled = false,
      readOnly = false,
      value,
      defaultValue,
      onChange,
      placeholder,
      className,
      prefix,
      suffix,
      loading,
      darkMode,
      prefixClassName,
      suffixClassName,
      ...rest
    },
    forwardedRef,
  ) {
    const id = useInputId(providedId);
    const hasError =
      !!error && (Array.isArray(error) ? error.length > 0 : true);
    const hasSuccess = !hasError && !!successText;
    const [charCount, setCharCount] = useState(
      (value ?? defaultValue ?? "").toString().length,
    );

    const internalRef = useAutoResize(autoResize, value);
    // Merge refs
    const ref =
      (forwardedRef as React.RefObject<HTMLTextAreaElement>) ?? internalRef;

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        if (showCount) setCharCount(e.target.value.length);
        onChange?.(e);
      },
      [onChange, showCount],
    );

    const textareaClass = cn(
      buildInputClass({
        size,
        variant,
        hasError,
        hasSuccess,
        disabled,
        hasPrefix: false,
        hasSuffix: false,
        fullWidth,
      }),
      "h-auto resize-y min-h-[80px] py-2",
      inputClassName ?? className,
    );

    return (
      <InputWrapper
        id={id}
        label={label}
        error={error}
        helperText={helperText}
        successText={successText}
        required={required}
        fullWidth={fullWidth}
        wrapperClassName={wrapperClassName}
        labelClassName={labelClassName}
        errorClassName={errorClassName}
        helperClassName={helperClassName}
        size={size}
        disabled={disabled}
      >
        <div className="relative">
          <textarea
            ref={ref}
            id={id}
            name={name}
            rows={rows}
            disabled={disabled}
            readOnly={readOnly}
            required={required}
            maxLength={maxLength}
            value={value}
            defaultValue={defaultValue}
            onChange={handleChange}
            placeholder={placeholder}
            aria-invalid={hasError ? "true" : undefined}
            className={textareaClass}
            {...rest}
          />
          {showCount && (
            <span
              className={cn(
                "absolute bottom-2 right-3 text-slate-400 dark:text-slate-500 pointer-events-none",
                sizeConfig[size].helper,
              )}
            >
              {charCount}
              {maxLength ? `/${maxLength}` : ""}
            </span>
          )}
        </div>
      </InputWrapper>
    );
  },
);

// ══════════════════════════════════════════════════════════════════════════════
// SelectInput
// ══════════════════════════════════════════════════════════════════════════════

const ChevronIcon = () => (
  <svg
    className="w-4 h-4 pointer-events-none"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// Group options by `group` field
function groupOptions(
  options: SelectOption[],
): Map<string | undefined, SelectOption[]> {
  const map = new Map<string | undefined, SelectOption[]>();
  for (const opt of options) {
    const key = opt.group;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(opt);
  }
  return map;
}

export const SelectInput = forwardRef<HTMLSelectElement, SelectInputProps>(
  function SelectInput(
    {
      id: providedId,
      name,
      label,
      error,
      helperText,
      successText,
      required,
      size = "md",
      variant = "outlined",
      fullWidth = false,
      wrapperClassName,
      labelClassName,
      inputClassName,
      errorClassName,
      helperClassName,
      options,
      placeholder,
      disabled = false,
      value,
      defaultValue,
      onChange,
      className,
      prefixClassName,
      suffixClassName,
      prefix,
      suffix,
      loading,
      darkMode,
      readOnly,
      ...rest
    },
    ref,
  ) {
    const id = useInputId(providedId);
    const hasError =
      !!error && (Array.isArray(error) ? error.length > 0 : true);
    const hasSuccess = !hasError && !!successText;
    const hasPrefix = !!prefix;

    const selectClass = cn(
      buildInputClass({
        size,
        variant,
        hasError,
        hasSuccess,
        disabled,
        hasPrefix,
        hasSuffix: true,
        fullWidth,
      }),
      "appearance-none cursor-pointer pr-9",
      inputClassName ?? className,
    );

    const grouped = groupOptions(options);
    const s = sizeConfig[size];

    return (
      <InputWrapper
        id={id}
        label={label}
        error={error}
        helperText={helperText}
        successText={successText}
        required={required}
        fullWidth={fullWidth}
        wrapperClassName={wrapperClassName}
        labelClassName={labelClassName}
        errorClassName={errorClassName}
        helperClassName={helperClassName}
        size={size}
        disabled={disabled}
      >
        <div className="relative flex items-center">
          {hasPrefix && (
            <span
              className={cn(
                "absolute left-0 flex items-center justify-center text-slate-400 pointer-events-none ml-3",
                s.icon,
                prefixClassName,
              )}
            >
              {prefix}
            </span>
          )}

          <select
            ref={ref}
            id={id}
            name={name}
            disabled={disabled}
            required={required}
            value={value}
            defaultValue={defaultValue}
            onChange={onChange}
            aria-invalid={hasError ? "true" : undefined}
            className={selectClass}
            {...rest}
          >
            {placeholder && (
              <option value="" disabled hidden>
                {placeholder}
              </option>
            )}
            {[...grouped.entries()].map(([group, opts]) =>
              group ? (
                <optgroup key={group} label={group}>
                  {opts.map((o) => (
                    <option key={o.value} value={o.value} disabled={o.disabled}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ) : (
                opts.map((o) => (
                  <option key={o.value} value={o.value} disabled={o.disabled}>
                    {o.label}
                  </option>
                ))
              ),
            )}
          </select>

          <span
            className={cn(
              "absolute right-0 flex items-center justify-center text-slate-400 pointer-events-none mr-3",
              suffixClassName,
            )}
          >
            <ChevronIcon />
          </span>
        </div>
      </InputWrapper>
    );
  },
);

// ══════════════════════════════════════════════════════════════════════════════
// Checkbox
// ══════════════════════════════════════════════════════════════════════════════

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    {
      id: providedId,
      name,
      label,
      error,
      helperText,
      successText,
      required,
      size = "md",
      fullWidth = false,
      wrapperClassName,
      labelClassName,
      inputClassName,
      errorClassName,
      helperClassName,
      checked,
      defaultChecked,
      onChange,
      indeterminate = false,
      disabled = false,
      loading,
      darkMode,
      readOnly,
      prefixClassName,
      suffixClassName,
      ...rest
    },
    ref,
  ) {
    const id = useInputId(providedId);
    const hasError =
      !!error && (Array.isArray(error) ? error.length > 0 : true);
    const s = sizeConfig[size];

    // Apply indeterminate via ref
    const internalRef = useRef<HTMLInputElement>(null);
    const resolvedRef =
      (ref as React.RefObject<HTMLInputElement>) ?? internalRef;
    React.useEffect(() => {
      if (resolvedRef.current) {
        resolvedRef.current.indeterminate = indeterminate;
      }
    }, [indeterminate, resolvedRef]);

    const checkSize =
      size === "sm" ? "w-3.5 h-3.5" : size === "full" ? "w-5 h-5" : "w-4 h-4";

    return (
      <InputWrapper
        id={id}
        label={undefined}
        error={error}
        helperText={helperText}
        successText={successText}
        required={required}
        fullWidth={fullWidth}
        wrapperClassName={wrapperClassName}
        labelClassName={labelClassName}
        errorClassName={errorClassName}
        helperClassName={helperClassName}
        size={size}
        disabled={disabled}
      >
        <label
          htmlFor={id}
          className={cn(
            "inline-flex items-start gap-2.5 cursor-pointer select-none",
            disabled && "opacity-50 cursor-not-allowed",
            labelClassName,
          )}
        >
          <input
            ref={resolvedRef}
            id={id}
            name={name}
            type="checkbox"
            disabled={disabled}
            required={required}
            checked={checked}
            defaultChecked={defaultChecked}
            onChange={(e) => onChange?.(e.target.checked, e)}
            aria-invalid={hasError ? "true" : undefined}
            className={cn(
              "shrink-0 mt-0.5 rounded border-slate-300 text-violet-600",
              "focus:ring-2 focus:ring-violet-500/30 focus:ring-offset-1",
              "dark:border-slate-600 dark:bg-slate-800 dark:checked:bg-violet-500",
              "disabled:cursor-not-allowed transition-colors",
              checkSize,
              inputClassName,
            )}
            {...rest}
          />
          {label && (
            <span
              className={cn(
                "text-slate-700 dark:text-slate-300 leading-snug",
                s.label
                  .replace("mb-1", "")
                  .replace("mb-0.5", "")
                  .replace("mb-1.5", ""),
              )}
            >
              {label}
              {required && <span className="ml-1 text-red-500">*</span>}
            </span>
          )}
        </label>
      </InputWrapper>
    );
  },
);

// ══════════════════════════════════════════════════════════════════════════════
// RadioGroup
// ══════════════════════════════════════════════════════════════════════════════

export const RadioGroup = memo<RadioGroupProps>(function RadioGroup({
  name,
  label,
  error,
  helperText,
  successText,
  required,
  size = "md",
  fullWidth = false,
  wrapperClassName,
  labelClassName,
  inputClassName,
  errorClassName,
  helperClassName,
  options,
  value,
  defaultValue,
  onChange,
  orientation = "vertical",
  disabled = false,
}) {
  const groupId = useInputId();
  const [selected, setSelected] = useControllableState(
    value,
    defaultValue ?? "",
    onChange,
  );
  const hasError = !!error && (Array.isArray(error) ? error.length > 0 : true);
  const s = sizeConfig[size];
  const radioSize =
    size === "sm" ? "w-3.5 h-3.5" : size === "full" ? "w-5 h-5" : "w-4 h-4";

  return (
    <InputWrapper
      id={groupId}
      label={label}
      error={error}
      helperText={helperText}
      successText={successText}
      required={required}
      fullWidth={fullWidth}
      wrapperClassName={wrapperClassName}
      labelClassName={labelClassName}
      errorClassName={errorClassName}
      helperClassName={helperClassName}
      size={size}
      disabled={disabled}
    >
      <div
        role="radiogroup"
        aria-required={required}
        aria-invalid={hasError ? "true" : undefined}
        className={cn(
          "flex gap-3",
          orientation === "vertical" ? "flex-col" : "flex-row flex-wrap",
        )}
      >
        {options.map((opt) => {
          const optId = `${groupId}-${opt.value}`;
          const isDisabled = disabled || opt.disabled;
          return (
            <label
              key={opt.value}
              htmlFor={optId}
              className={cn(
                "inline-flex items-start gap-2.5 cursor-pointer select-none",
                isDisabled && "opacity-50 cursor-not-allowed",
              )}
            >
              <input
                id={optId}
                name={name}
                type="radio"
                disabled={isDisabled}
                value={opt.value}
                checked={selected === opt.value}
                onChange={() => setSelected(opt.value)}
                className={cn(
                  "shrink-0 mt-0.5 border-slate-300 text-purpleOne",
                  "focus:ring-2 focus:ring-purpleOne/30 focus:ring-offset-1",
                  "dark:border-slate-600 dark:bg-slate-800 dark:checked:bg-purpleOne",
                  "transition-colors disabled:cursor-not-allowed",
                  radioSize,
                  inputClassName,
                )}
              />
              <span className="flex flex-col">
                <span
                  className={cn(
                    "text-slate-700 dark:text-slate-300 leading-snug",
                    s.label.replace(/mb-\S+/, ""),
                  )}
                >
                  {opt.label}
                </span>
                {opt.helperText && (
                  <span
                    className={cn(
                      "text-slate-500 dark:text-slate-400",
                      s.helper,
                    )}
                  >
                    {opt.helperText}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </InputWrapper>
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// FileInput
// ══════════════════════════════════════════════════════════════════════════════


export const FileInput = forwardRef<HTMLInputElement, FileInputProps>(
  function FileInput(
    {
      id: providedId,
      name,
      label,
      error,
      helperText,
      successText,
      variant,
      prefix,
      suffix,
      loading,
      readOnly,
      darkMode,
      prefixClassName,
      suffixClassName,
      required,
      size = "md",
      fullWidth = false,
      wrapperClassName,
      labelClassName,
      inputClassName,
      errorClassName,
      helperClassName,
      accept,
      multiple,
      onChange,
      dragAndDrop = false,
      maxSizeMB,
      disabled = false,
      ...rest
    },
    ref,
  ) {
    const id = useInputId(providedId);
    const [files, setFiles] = useState<File[]>([]);
    const [sizeError, setSizeError] = useState<string | null>(null);
    const hasError = !!error || !!sizeError;

    const handleFiles = useCallback(
      (fileList: FileList) => {
        if (maxSizeMB) {
          const oversized = Array.from(fileList).filter(
            (f) => f.size > maxSizeMB * 1024 * 1024,
          );
          if (oversized.length) {
            setSizeError(`File exceeds ${maxSizeMB}MB limit`);
            return;
          }
        }
        setSizeError(null);
        setFiles(Array.from(fileList));
        onChange?.(fileList);
      },
      [maxSizeMB, onChange],
    );

    const { isDragging, onDragOver, onDragLeave, onDrop } =
      useFileDrop(handleFiles);

    if (!dragAndDrop) {
      return (
        <InputWrapper
          id={id}
          label={label}
          error={error ?? sizeError ?? undefined}
          helperText={helperText}
          required={required}
          fullWidth={fullWidth}
          wrapperClassName={wrapperClassName}
          labelClassName={labelClassName}
          errorClassName={errorClassName}
          helperClassName={helperClassName}
          size={size}
          disabled={disabled}
        >
          <input
            ref={ref}
            id={id}
            name={name}
            type="file"
            disabled={disabled}
            required={required}
            accept={accept}
            multiple={multiple}
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            className={cn(
              "block w-full text-sm text-slate-500 dark:text-slate-400",
              "file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0",
              "file:text-sm file:font-medium file:bg-violet-50 file:text-violet-700",
              "dark:file:bg-violet-900/30 dark:file:text-violet-300",
              "hover:file:bg-violet-100 dark:hover:file:bg-violet-900/50",
              "file:cursor-pointer file:transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              inputClassName,
            )}
            {...rest}
          />
        </InputWrapper>
      );
    }

    // Drag & Drop zone
    return (
      <InputWrapper
        id={id}
        label={label}
        error={error ?? sizeError ?? undefined}
        helperText={helperText}
        required={required}
        fullWidth={fullWidth}
        wrapperClassName={wrapperClassName}
        labelClassName={labelClassName}
        errorClassName={errorClassName}
        helperClassName={helperClassName}
        size={size}
        disabled={disabled}
      >
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={cn(
            "relative flex flex-col items-center justify-center gap-2 px-8 py-10 rounded-xl border border-dashed transition-all duration-200 cursor-pointer",
            isDragging
              ? "border-purpleOne bg-purpleOne/5 dark:bg-purpleOne/20"
              : hasError
                ? "border-red-400 bg-red-50/50 dark:bg-red-900/10"
                : "border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800/50 hover:border-purpleOne/50",
            disabled && "opacity-50 cursor-not-allowed pointer-events-none",
            inputClassName
          )}
        >
          <input
            ref={ref}
            id={id}
            name={name}
            type="file"
            disabled={disabled}
            required={required}
            accept={accept}
            multiple={multiple}
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            {...rest}
          />
          <span
            className={cn(
              "text-slate-800 dark:text-slate-200",
              isDragging && "text-purpleOne",
            )}
          >
            <UploadIcon />
          </span>
          <div className="text-center pointer-events-none">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {isDragging ? (
                "Drop files here"
              ) : (
                <p className="text-blackColor text-sm font-medium leading-[160%]">
                  Drag & drop medias, or <span className="text-purpleOne text-sm font-medium leading-[160%]">Browse</span>
                </p>
              )}
            </p>
            <p className="text-xs text-descriptionColor leading-[160%] mt-1">
               Supported formats: PNG,JPEG, JPG. Maximum file size: 20 MB
            </p>
          </div>
          {files.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 mt-2 pointer-events-none z-10 relative">
              {files.map((f) => (
                <li
                  key={f.name}
                  className="text-xs bg-purpleOne/10 dark:bg-purpleOne/20 text-purpleOne px-2 py-0.5 rounded-full"
                >
                  {f.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </InputWrapper>
    );
  },
);
