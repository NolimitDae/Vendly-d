"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to error monitoring service in production
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Something went wrong</h1>
          <p className="text-gray-500 text-sm max-w-sm dark:text-gray-400">
            An unexpected error occurred. Please try again or contact support if the problem persists.
          </p>
          <button
            onClick={reset}
            className="px-6 py-2 rounded-full bg-plum-500 text-white text-sm font-semibold hover:bg-plum-700 transition"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
