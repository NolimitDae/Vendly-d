// ─── Public API ───────────────────────────────────────────────────────────────
export { BaseInput } from "./base/BaseInput";
export { InputWrapper } from "./base/InputWrapper";

// Variant components
export {
  GenericInput,
  Textarea,
  SelectInput,
  Checkbox,
  RadioGroup,
  FileInput,
} from "./variants";

// Types
export type {
  InputSize,
  InputVariant,
  InputState,
  InputType,
  InputStyleConfig,
  BaseInputProps,
  TextInputProps,
  TextareaProps,
  SelectInputProps,
  SelectOption,
  CheckboxProps,
  RadioGroupProps,
  RadioOption,
  FileInputProps,
  InputWrapperProps,
} from "./types";

// Utilities (for custom extensions)
export {
  cn,
  sizeConfig,
  variantConfig,
  buildInputClass,
  buildLabelClass,
} from "./utils/variants";
export {
  useInputId,
  usePasswordToggle,
  useControllableState,
  useAutoResize,
  useFileDrop,
} from "@/hooks";
