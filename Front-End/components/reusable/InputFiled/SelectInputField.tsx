import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import FunnelIcon from "@/icons/FunnelIcon";

type Option = { value: string; label: string };

interface SelecteInputFieldProps {
  value?: string;
  onValueChange?: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  showLeftIcon?: boolean;
}


export default function SelecteInputField({
  value,
  onValueChange,
  options,
  placeholder = "Select",
  className = "",
  id,
  disabled = false,
  showLeftIcon,
}: SelecteInputFieldProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        id={id}
        className={`${className} w-full text-blackColor font-xs`}
        disabled={disabled}
      >
        {showLeftIcon && <FunnelIcon />}
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
