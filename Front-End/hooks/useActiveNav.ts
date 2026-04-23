import { usePathname } from "next/navigation"

export const useActiveNav = () => {
    const pathName = usePathname();

    const isActive = (path: string, exact: boolean) => {
        return exact ? pathName === path : pathName.startsWith(path)
    }

    return { isActive, pathName }
}