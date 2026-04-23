import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { ThemeScript } from "@/providers/ThemeScript";
import "../globals.css";

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
      <body>
        <ThemeProvider>
        
          {children}
          <div className="bg-[#FAFAFA] dark:bg-background">
          
          </div>
        </ThemeProvider>
      </body>
    </html>
       
  );
}