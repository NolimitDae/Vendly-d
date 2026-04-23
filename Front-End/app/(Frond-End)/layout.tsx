import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { ThemeScript } from "@/providers/ThemeScript";
import "../globals.css";

export default function FrontEndLayout({
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
          <Navbar />
          {children}
          <div className="bg-[#FAFAFA] dark:bg-background">
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
       
  );
}