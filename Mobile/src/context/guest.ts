/**
 * Browsing without an account (App Store guideline 5.1.1: people can look around before signing up).
 * AuthProvider keeps the flag and registers the sign-in prompt; anything that needs an account (saving,
 * messaging, booking) calls `needsAccount(why)` first and stops when it returns true.
 */
let guest = false;
let prompt: ((why: string) => void) | null = null;

export const guestSession = {
  set(on: boolean) {
    guest = on;
  },
  isGuest: () => guest,
  setPrompt(fn: ((why: string) => void) | null) {
    prompt = fn;
  },
};

/** True (and asks the guest to sign in) when there's no account to do this with. */
export function needsAccount(why: string): boolean {
  if (!guest) return false;
  prompt?.(why);
  return true;
}

/** Where the sign-in screens open when a guest chooses to sign in or create an account. */
let authStart: 'SignIn' | 'RoleSelect' | null = null;
export const takeAuthStart = () => {
  const r = authStart;
  authStart = null;
  return r;
};
export const setAuthStart = (r: 'SignIn' | 'RoleSelect') => {
  authStart = r;
};
