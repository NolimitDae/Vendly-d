"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  showCloseButton?: boolean;
  closeOnBackdrop?: boolean;
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-[720px]", 
  full: "max-w-7xl",
};

const ModalWrapper = ({
  isOpen,
  onClose,
  children,
  size = "md",
  showCloseButton = true,
  closeOnBackdrop = true,
}: ModalProps) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={overlayRef}
      onClick={(e) =>
        closeOnBackdrop && e.target === overlayRef.current && onClose()
      }
      className="fixed inset-0 z-50 overflow-y-auto  bg-black/30"
    >
      <div className="min-h-full flex items-center justify-center p-4 md:p-8">
        <div
          className={`relative w-full ${sizeClasses[size]} bg-white rounded-3xl shadow-2xl animate-modal overflow-hidden`}
        >
          {showCloseButton && (
            <button
              onClick={onClose}
              className="absolute top-1 right-5 z-20 p-2 rounded-full bg-gray-100/50
                             hover:bg-gray-200 transition-all mt-2 cursor-pointer"
            >
              <X size={22.5} className="text-gray-900 " />
            </button>
          )}
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ModalWrapper;
