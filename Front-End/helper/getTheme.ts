export const getTheme = () => {
    if (typeof window !== "undefined") {
        return localStorage.getItem("theme") || "light";
    }
    
    return "light";

}