import CloseIcon from "@/public/icon/arrow-right-01.svg";
import Image from "next/image";
import { Drawer, DrawerContent } from "../ui/drawer";
function RootDrawer({
  open,
  setOpen,
  children,
}: {
  open?: boolean;
  setOpen?: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <Drawer open={open} onOpenChange={setOpen} direction="right">
        <DrawerContent className="max-w-2xl! w-full">
          <div className="relative ">
            <button
              onClick={() => setOpen(false)}
              aria-label="Close drawer"
              className="group hover:scale-105 transition-all duration-200 bg-white rounded-full cursor-pointer w-12 h-12 flex justify-center shadow-2xl items-center absolute top-1/2 transform -translate-y-1/2 left-4 md:-left-12 lg:-left-16 z-50"
            >
              <Image
                src={CloseIcon}
                alt="Close"
                width={20}
                height={20}
                className="w-6 h-6 group-hover:scale-110 transition-all duration-200"
              />
            </button>
            <div className="max-h-[calc(100vh)] overflow-y-auto pb-4 ">
              {children}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

export default RootDrawer;
