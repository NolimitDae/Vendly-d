"use client"
import { ChevronRight, Link } from "lucide-react";
import { usePathname } from "next/navigation";
function Pathname() {
    const pathname = usePathname();
  const sPath = pathname.split("/").filter(Boolean);
  return (
    <div>
      <div className="flex flex-wrap mt-8 lg:mt-15 items-center gap-2 text-base text-gray-600">
            <span className="flex items-center gap-2 ">
              {" "}
              Home <ChevronRight className="w-4 h-4 text-[#737373]" />
            </span>

            {sPath.map((path, index) => {
              const fullPath = "/" + sPath.slice(0, index + 1).join("/");
              const isLast = index === sPath.length - 1;

              return (
                <div key={index} className="flex items-center gap-1">
                  {!isLast ? (
                    <>
                      <Link href={fullPath} className=" capitalize">
                        {path}
                      </Link>
                      <ChevronRight className="w-4 h-4 text-[#737373]" />
                    </>
                  ) : (
                    <span className="capitalize text-headerColor font-medium">
                      {path.split("-").join(" ")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
    </div>
  )
}

export default Pathname
