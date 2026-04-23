type Size = "sm" | "md" | "lg";
type Variant = "outlined" | "filled" | "ghost";

interface TagInputProps {
  label?: string;
  value?: string[];
  onChange?: (val: string[]) => void;
  options: string[];

  placeholder?: string;

  size?: Size;
  variant?: Variant;
  fullWidth?: boolean;

  disabled?: boolean;
  error?: string;

  // style overrides (design system hook)
  styles?: {
    wrapper?: string;
    label?: string;
    input?: string;
    chip?: string;
    dropdown?: string;
    option?: string;
  };

  className?: string;
}