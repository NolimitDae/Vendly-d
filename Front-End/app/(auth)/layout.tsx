import CustomToastContainer from "@/components/CustomToast/CustomToastContainer";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { ThemeScript } from "@/providers/ThemeScript";
import { Plus_Jakarta_Sans } from "next/font/google";
import "../globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"] });

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={jakarta.className}>
        <ThemeProvider>
        
          {children}
          <CustomToastContainer />
          <div className="bg-[#FAFAFA] dark:bg-background">
          
          </div>
        </ThemeProvider>
      </body>
    </html>
       
  );
}