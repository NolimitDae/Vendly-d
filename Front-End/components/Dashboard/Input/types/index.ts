import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode, Ref } from "react";

// ─── Size & Variant Tokens ───────────────────────────────────────────────────

export type InputSize = "sm" | "md" | "full";
export type InputVariant = "outlined" | "filled" | "ghost";
export type InputState = "default" | "error" | "success" | "warning" | "disabled";
export type InputType =
  | "text" | "password" | "email" | "number" | "tel" | "url" | "search"
  | "date" | "time" | "datetime-local" | "month" | "week"
  | "color" | "range" | "file" | "hidden";

//  Shared Styling Config 

export interface InputStyleConfig {
  wrapperClassName?: string;
  labelClassName?: string;
  inputClassName?: string;
  errorClassName?: string;
  helperClassName?: string;
  prefixClassName?: string;
  suffixClassName?: string;
}

//  Base Input Props 

export interface BaseInputProps extends InputStyleConfig {
  id?: string;
  name?: string;
  label?: ReactNode;
  error?: string | string[];
  helperText?: ReactNode;
  successText?: string;
  size?: InputSize;
  variant?: InputVariant;
  fullWidth?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
  loading?: boolean;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  darkMode?: boolean;
}

//  TextInput / Standard Input 

export interface TextInputProps
  extends BaseInputProps,
    Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix" | "suffix"> {
  type?: InputType;
  clearable?: boolean;
  passwordToggle?: boolean;
  ref?: Ref<HTMLInputElement>;
}

//  Textarea 

export interface TextareaProps
  extends BaseInputProps,
    Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "size" | "prefix" | "suffix"> {
  autoResize?: boolean;
  rows?: number;
  showCount?: boolean;
  maxLength?: number;
  ref?: Ref<HTMLTextAreaElement>;
}

//  Select 

export interface SelectOption {
  label: string;
  value: string | number;
  disabled?: boolean;
  group?: string;
}

export interface SelectInputProps
  extends BaseInputProps,
    Omit<SelectHTMLAttributes<HTMLSelectElement>, "size" | "prefix" | "suffix"> {
  options: SelectOption[];
  placeholder?: string;
  ref?: Ref<HTMLSelectElement>;
}

//  Checkbox 

export interface CheckboxProps extends Omit<BaseInputProps, "prefix" | "suffix" | "variant"> {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean, event: React.ChangeEvent<HTMLInputElement>) => void;
  indeterminate?: boolean;
  ref?: Ref<HTMLInputElement>;
}

//  Radio 

export interface RadioOption {
  label: ReactNode;
  value: string | number;
  disabled?: boolean;
  helperText?: string;
}

export interface RadioGroupProps extends Omit<BaseInputProps, "prefix" | "suffix" | "variant"> {
  options: RadioOption[];
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (value: string | number) => void;
  orientation?: "horizontal" | "vertical";
  name: string;
}

//  FileInput 

export interface FileInputProps extends BaseInputProps {
  accept?: string;
  multiple?: boolean;
  onChange?: (files: FileList | null) => void;
  dragAndDrop?: boolean;
  maxSizeMB?: number;
  ref?: Ref<HTMLInputElement>;
}

//  InputWrapper 

export interface InputWrapperProps {
  id: string;
  label?: ReactNode;
  error?: string | string[];
  helperText?: ReactNode;
  successText?: string;
  required?: boolean;
  fullWidth?: boolean;
  wrapperClassName?: string;
  labelClassName?: string;
  errorClassName?: string;
  helperClassName?: string;
  size?: InputSize;
  children: ReactNode;
  disabled?: boolean;
}
