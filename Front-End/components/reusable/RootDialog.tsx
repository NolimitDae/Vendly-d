import React from "react";
import { Dialog, DialogContent } from "../ui/dialog";

function RootDialog({
  open,
  setOpen,
  children,
  className
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={`p-0 sm:max-w-2xl w-full max-h-[90vh] overflow-y-auto ${className}`}>
          {children}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RootDialog;
