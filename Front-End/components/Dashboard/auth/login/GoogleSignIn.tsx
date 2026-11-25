"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "react-toastify";
import { Loader2 } from "lucide-react";
import { AuthService } from "@/service/auth/auth.service";
import { saveSession } from "@/lib/session";

/** The website's Google OAuth client ID (public, set at build time). Without it the button isn't shown. */
export const googleClientId = () => process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

type Role = "CLIENT" | "VENDOR" | "EVENT_PLANNER";
const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: "CLIENT", label: "I'm booking", hint: "Find and book vendors for my event" },
  { value: "VENDOR", label: "I'm a vendor", hint: "Get booked for my services" },
  { value: "EVENT_PLANNER", label: "I'm a planner", hint: "Plan events and book vendors for clients" },
];

declare global {
  interface Window {
    google?: { accounts: { id: { initialize: (o: object) => void; renderButton: (el: HTMLElement, o: object) => void } } };
  }
}

/** Where each kind of account lands after signing in (the same as signing in with a password). */
export function homeFor(type?: string) {
  if (type === "ADMIN") return "/dashboard";
  if (type === "VENDOR") return "/vendor";
  if (type === "EVENT_PLANNER") return "/event-planner/profile";
  return "/marketplace";
}

/**
 * "Continue with Google" (Google's own button). Google hands back an ID token, which the API checks
 * and trades for a Vendly session. A new account picks how it will use Vendly and accepts the terms
 * first; an account with two-step sign-in is asked for its code.
 */
export default function GoogleSignIn() {
  const router = useRouter();
  const slot = useRef<HTMLDivElement>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "role" | "code">("idle");
  const [role, setRole] = useState<Role | null>(null);
  const [terms, setTerms] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (token: string, extra: { role?: Role; accepted_terms?: boolean; token?: string } = {}) => {
    setBusy(true);
    try {
      const res = await AuthService.social({ provider: "google", id_token: token, ...extra });
      if (res.data?.needs_role) {
        setStep("role");
        return;
      }
      if (!res.data?.success) throw new Error(res.data?.message ?? "Google sign-in failed");
      saveSession(res.data.authorization?.access_token, res.data.authorization?.refresh_token);
      toast.success("Welcome to Vendly!");
      router.push(homeFor(res.data.type));
    } catch (e: any) {
      const msg: string = e?.response?.data?.message ?? e?.message ?? "";
      if (msg === "Token is required") setStep("code");
      else toast.error(msg || "Google sign-in failed. Try again, or use your email.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!googleClientId() || !slot.current) return;
    const draw = () => {
      if (!window.google || !slot.current) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId(),
        callback: (r: { credential?: string }) => {
          if (!r.credential) return;
          setIdToken(r.credential);
          void send(r.credential);
        },
      });
      // Google's dark button on the site's dark theme, its light one otherwise
      const dark = document.documentElement.classList.contains("dark");
      window.google.accounts.id.renderButton(slot.current, {
        theme: dark ? "filled_black" : "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: Math.min(slot.current.offsetWidth || 320, 400),
      });
    };
    if (window.google) return draw();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = draw;
    document.head.appendChild(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!googleClientId()) return null;

  return (
    <div className="space-y-3">
      {/* colorScheme light: on the dark theme the browser would otherwise paint Google's button frame as a
          white box; with the frame's own (light) scheme it stays see-through around the pill */}
      <div ref={slot} className="flex justify-center min-h-[44px] w-full" style={{ colorScheme: "light" }} data-testid="google-button" />
      {busy && step === "idle" && <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />}

      {step === "role" && idToken && (
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
            onClick={() => send(idToken, { role: role!, accepted_terms: true })}
            className="w-full gradient-bg text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Create my account
          </button>
        </div>
      )}

      {step === "code" && idToken && (
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
            onClick={() => send(idToken, { token: code })}
            className="w-full gradient-bg text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
