"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "react-toastify";
import { Loader2 } from "lucide-react";
import { AuthService } from "@/service/auth/auth.service";
import { saveSession } from "@/lib/session";

/** The website's Google OAuth client ID (public, set at build time). Without it the Google button isn't shown. */
export const googleClientId = () => process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
/** The website's Sign in with Apple Services ID (public, set at build time). Without it the Apple button isn't shown. */
export const appleServicesId = () => process.env.NEXT_PUBLIC_APPLE_SERVICES_ID ?? "";
/** Whether any "continue with" button shows. */
export const socialSignInOffered = () => !!googleClientId() || !!appleServicesId();

type Provider = "google" | "apple";
type Role = "CLIENT" | "VENDOR" | "EVENT_PLANNER";
const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: "CLIENT", label: "I'm booking", hint: "Find and book vendors for my event" },
  { value: "VENDOR", label: "I'm a vendor", hint: "Get booked for my services" },
  { value: "EVENT_PLANNER", label: "I'm a planner", hint: "Plan events and book vendors for clients" },
];

interface AppleSignInResponse {
  authorization?: { id_token?: string; code?: string };
  user?: { name?: { firstName?: string; lastName?: string } };
}

declare global {
  interface Window {
    google?: { accounts: { id: { initialize: (o: object) => void; renderButton: (el: HTMLElement, o: object) => void } } };
    AppleID?: { auth: { init: (o: object) => void; signIn: () => Promise<AppleSignInResponse> } };
  }
}

/** Where each kind of account lands after signing in (the same as signing in with a password). */
export function homeFor(type?: string) {
  if (type === "ADMIN") return "/dashboard";
  if (type === "VENDOR") return "/vendor";
  if (type === "EVENT_PLANNER") return "/event-planner/profile";
  return "/marketplace";
}

/** Loads a provider's script once (straight away if its global is already there). */
function loadScript(src: string, ready: () => boolean, onLoad: () => void) {
  if (ready()) return onLoad();
  const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
  if (existing) {
    if (existing.dataset.loaded) onLoad();
    else existing.addEventListener("load", onLoad);
    return;
  }
  const s = document.createElement("script");
  s.src = src;
  s.async = true;
  s.addEventListener("load", () => {
    s.dataset.loaded = "1";
    onLoad();
  });
  document.head.appendChild(s);
}

/**
 * "Continue with Google" (Google's own button) and "Continue with Apple" (in Apple's style), each once
 * its ID is set. The provider hands back an ID token, which the API checks and trades for a Vendly
 * session. A new account picks how it will use Vendly and accepts the terms first; an account with
 * two-step sign-in is asked for its code.
 */
export default function SocialSignIn() {
  const router = useRouter();
  const googleSlot = useRef<HTMLDivElement>(null);
  // what the provider gave back, kept for the follow-up steps
  const [pending, setPending] = useState<{ provider: Provider; id_token: string; name?: string; authorization_code?: string } | null>(null);
  const [step, setStep] = useState<"idle" | "role" | "code">("idle");
  const [role, setRole] = useState<Role | null>(null);
  const [terms, setTerms] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (p: NonNullable<typeof pending>, extra: { role?: Role; accepted_terms?: boolean; token?: string } = {}) => {
    setBusy(true);
    try {
      const res = await AuthService.social({ ...p, ...extra });
      if (res.data?.needs_role) {
        setStep("role");
        return;
      }
      if (!res.data?.success) throw new Error(res.data?.message ?? "Sign-in failed");
      saveSession(res.data.authorization?.access_token, res.data.authorization?.refresh_token);
      toast.success("Welcome to Vendly!");
      router.push(homeFor(res.data.type));
    } catch (e: any) {
      const msg: string = e?.response?.data?.message ?? e?.message ?? "";
      if (msg === "Token is required") setStep("code");
      else toast.error(msg || "Sign-in failed. Try again, or use your email.");
    } finally {
      setBusy(false);
    }
  };

  const start = (p: NonNullable<typeof pending>) => {
    setPending(p);
    setStep("idle");
    void send(p);
  };

  // Google: its own button, drawn into the slot
  useEffect(() => {
    const clientId = googleClientId();
    if (!clientId || !googleSlot.current) return;
    loadScript("https://accounts.google.com/gsi/client", () => !!window.google, () => {
      if (!window.google || !googleSlot.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (r: { credential?: string }) => r.credential && start({ provider: "google", id_token: r.credential }),
      });
      // Google's dark button on the site's dark theme, its light one otherwise
      const dark = document.documentElement.classList.contains("dark");
      googleSlot.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleSlot.current, {
        theme: dark ? "filled_black" : "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: Math.min(googleSlot.current.offsetWidth || 320, 400),
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apple: Sign in with Apple JS in a pop-up window
  const [appleReady, setAppleReady] = useState(false);
  useEffect(() => {
    const servicesId = appleServicesId();
    if (!servicesId) return;
    loadScript("https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js", () => !!window.AppleID, () => {
      window.AppleID?.auth.init({ clientId: servicesId, scope: "name email", redirectURI: `${window.location.origin}/login`, usePopup: true });
      setAppleReady(!!window.AppleID);
    });
  }, []);

  const apple = async () => {
    if (!window.AppleID) return;
    try {
      const r = await window.AppleID.auth.signIn();
      const idToken = r.authorization?.id_token;
      if (!idToken) throw new Error("Apple didn't return a sign-in token");
      // Apple only shares the name the first time, so pass it along for a new account
      const name = [r.user?.name?.firstName, r.user?.name?.lastName].filter(Boolean).join(" ") || undefined;
      start({ provider: "apple", id_token: idToken, ...(name ? { name } : {}), ...(r.authorization?.code ? { authorization_code: r.authorization.code } : {}) });
    } catch (e: any) {
      // closing the pop-up isn't an error worth showing
      if (e?.error === "popup_closed_by_user" || e?.error === "user_cancelled_authorize") return;
      toast.error(e?.message ?? "Apple sign-in failed. Try again, or use your email.");
    }
  };

  if (!socialSignInOffered()) return null;

  return (
    <div className="space-y-3">
      {googleClientId() && (
        // colorScheme light: on the dark theme the browser would otherwise paint Google's button frame as
        // a white box; with the frame's own (light) scheme it stays see-through around the pill
        <div ref={googleSlot} className="flex justify-center min-h-[44px] w-full" style={{ colorScheme: "light" }} data-testid="google-button" />
      )}
      {appleServicesId() && (
        // Apple's style: black (white in dark mode) with the Apple logo, the same size as Google's
        <button
          type="button"
          onClick={apple}
          disabled={!appleReady || busy}
          className="mx-auto flex h-[40px] w-full max-w-[400px] items-center justify-center gap-2 rounded-full bg-black text-white text-[15px] font-medium disabled:opacity-60 dark:bg-white dark:text-black"
        >
          <svg viewBox="0 0 17 20" className="h-[18px] w-[15px]" fill="currentColor" aria-hidden="true">
            <path d="M14.2 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1zM11.6 3c.7-.9 1.2-2 1-3.2-1 .1-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5z" />
          </svg>
          Continue with Apple
        </button>
      )}
      {busy && step === "idle" && <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />}

      {step === "role" && pending && (
        <div className="rounded-2xl border border-borderColor p-4 space-y-3" role="group" aria-label="Finish signing up">
          <p className="font-semibold text-gray-900 dark:text-white">How will you use Vendly?</p>
          <div className="grid gap-2">
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRole(r.value)}
                aria-pressed={role === r.value}
                className={`text-left rounded-xl border p-3 transition ${role === r.value ? "border-primary bg-primary/5" : "border-borderColor hover:border-orchid-500"}`}
              >
                <span className="block text-sm font-medium text-gray-900 dark:text-white">{r.label}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">{r.hint}</span>
              </button>
            ))}
          </div>
          <label className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1" />
            <span>
              I agree to the <Link href="/terms" className="text-primary underline">Terms of Service</Link> and{" "}
              <Link href="/privacy" className="text-primary underline">Privacy Policy</Link>
            </span>
          </label>
          <button
            type="button"
            disabled={!role || !terms || busy}
            onClick={() => send(pending, { role: role!, accepted_terms: true })}
            className="w-full gradient-bg text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Create my account
          </button>
        </div>
      )}

      {step === "code" && pending && (
        <div className="rounded-2xl border border-borderColor p-4 space-y-3">
          <p className="text-sm text-gray-900 dark:text-white">Enter the 6-digit code from your authenticator app.</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            aria-label="Authenticator code"
            className="w-full rounded-xl border border-borderColor bg-transparent px-3 py-2 text-center tracking-[0.4em]"
          />
          <button
            type="button"
            disabled={code.length !== 6 || busy}
            onClick={() => send(pending, { token: code })}
            className="w-full gradient-bg text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
