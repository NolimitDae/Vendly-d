import { ACCESS_TOKEN_COOKIE, LOGGED_IN_COOKIE } from "@/lib/session";

/** The attribute on <html> while someone is logged in (CSS hides vendor sign-up pitches with it). */
export const SIGNED_IN_ATTRIBUTE = "data-signed-in";

// Stringified to run as an inline blocking script, before the page paints
function signedInInitScript(cookies: string[], attribute: string) {
  const names = document.cookie.split("; ").map((c) => c.split("=")[0]);
  if (cookies.some((c) => names.includes(c))) document.documentElement.setAttribute(attribute, "");
}

/**
 * Marks the page as signed in before it paints (from the readable "logged in" cookie), so the home
 * page's "list your business" pitches never flash for people who already have an account. The
 * navbar keeps it up to date after logging in or out without a reload.
 */
export function SignedInScript() {
  const script = `(${signedInInitScript.toString()})(${JSON.stringify([LOGGED_IN_COOKIE, ACCESS_TOKEN_COOKIE])}, '${SIGNED_IN_ATTRIBUTE}')`;
  return <script dangerouslySetInnerHTML={{ __html: script }} suppressHydrationWarning />;
}
