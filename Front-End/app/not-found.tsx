import Image from "next/image";
import Link from "next/link";
import { ThemeScript } from "@/providers/ThemeScript";
import { ThemeProvider } from "@/providers/ThemeProvider";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function NotFound() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <ThemeProvider>
          <Navbar />

          <main className="min-h-[calc(100vh-160px)] flex flex-col items-center justify-center px-4 py-20 text-center">
            {/* Stacked 404 + logo animation */}
            <div className="relative select-none mb-6 w-64 h-40 sm:w-80 sm:h-52">
              <span
                className="absolute inset-0 flex items-center justify-center text-[9rem] sm:text-[12rem] font-extrabold leading-none text-primaryColor"
                style={{ opacity: 0.06 }}
              >
                404
              </span>
              <div className="absolute inset-0 flex items-center justify-center">
                <Image
                  src="/site_logo.png"
                  alt="Vendly"
                  width={80}
                  height={80}
                  className="w-16 h-16 sm:w-20 sm:h-20 animate-bounce"
                  style={{ animationDuration: "2.5s" }}
                />
              </div>
            </div>

            <span className="bg-gradient-to-r from-purpleOne via-purpleTwo to-purpleThree bg-clip-text text-transparent text-2xl sm:text-3xl font-bold mb-3">
              Vendly
            </span>

            <h1 className="text-2xl sm:text-4xl font-bold text-blackColor dark:text-white mb-4">
              Page not found
            </h1>

            <p className="text-descriptionColor dark:text-gray-400 text-base sm:text-lg max-w-md mb-10 leading-relaxed">
              The page you&apos;re looking for doesn&apos;t exist or has been
              moved. Let&apos;s get you back on track.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/"
                className="gradient-bg text-white font-semibold px-8 py-3 rounded-full text-sm hover:opacity-90 transition"
              >
                Back to Home
              </Link>
              <Link
                href="/marketplace"
                className="border border-gray-200 dark:border-gray-700 text-blackColor dark:text-white font-semibold px-8 py-3 rounded-full text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                Browse Marketplace
              </Link>
            </div>
          </main>

          <div className="bg-[#FAFAFA] dark:bg-background">
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
