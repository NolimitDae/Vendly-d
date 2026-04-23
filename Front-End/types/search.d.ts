import type React from "react";

export interface SearchResult {
  id: string | number;
  key: string;
  vendorName: {
    name: string;
    image: string;
    joinedDate: string;
  };
  category: string;
  subcategory: string;
  operatedService: string;
  location: string;
  subscription: string;
  totalBookings: number;
  label?: string;
  description?: string;
  icon?: React.ReactNode;
  _isRecent?: boolean
  info?: {
    eventName: string;
    date: string;
  }
  plannerName: {
    name: string;
    image: string;
    joinedDate: string;
  }
  customer?: string;
  payerName?: string;
  payeeName?: string;
  transactionId?: string;
}

export type SearchStatus = "idle" | "loading" | "success" | "error";

export interface GenericSearchHandle {
  focus: () => void;
  blur: () => void;
  clear: () => void;
  getValue: () => string;
}

export interface GenericSearchProps<T extends SearchResult = SearchResult> {
  // Value control
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;

  // Core callbacks
  onSearch: (query: string) => Promise<T[]> | T[];
  onSelect?: (item: T) => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onClear?: () => void;

  // Behavior config
  debounceMs?: number;
  minChars?: number;
  maxResults?: number;

  // UI config
  placeholder?: string;
  showIcon?: boolean;
  showClear?: boolean;
  showRecentSearches?: boolean;
  recentSearches?: T[];
  disabled?: boolean;
  autoFocus?: boolean;

  // Custom renderers
  renderResult?: (item: T, query: string) => React.ReactNode;
  renderEmpty?: (query: string) => React.ReactNode;
  renderLoading?: () => React.ReactNode;
  renderError?: (error: Error) => React.ReactNode;

  // Data transformation
  groupBy?: (item: T) => string;
  filterResults?: (items: T[], query: string) => T[];

  // Styling
  className?: string;
  inputClassName?: string;
  dropdownClassName?: string;
  size?: "sm" | "md" | "lg";

  // Accessibility
  "aria-label"?: string;
  id?: string;
}

export interface DropdownProps<T extends SearchResult> {
  id: string;
  items: T[];
  activeIndex: number;
  status: SearchStatus;
  error: Error | null;
  query: string;
  groupBy?: (item: T) => string;
  renderResult?: (item: T, query: string) => React.ReactNode;
  renderEmpty?: (query: string) => React.ReactNode;
  renderLoading?: () => React.ReactNode;
  renderError?: (error: Error) => React.ReactNode;
  onSelect: (item: T) => void;
  className?: string;
}

export interface UseSearchOptions<T extends SearchResult> {
  query: string;
  enabled: boolean;
  onSearch: (query: string) => Promise<T[]> | T[];
  maxResults: number;
  filterResults?: (items: T[], query: string) => T[];
}

export interface UseSearchReturn<T extends SearchResult> {
  results: T[];
  status: SearchStatus;
  error: Error | null;
}

export interface UseKeyboardNavOptions {
  isOpen: boolean;
  itemCount: number;
  onSelect: (index: number) => void;
  onClose: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
}

export interface UseKeyboardNavReturn {
  activeIndex: number;
  resetIndex: () => void;
}