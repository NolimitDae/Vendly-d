"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, X } from "lucide-react";
import { useOnboarding } from "@/providers/OnboardingProvider";
import { ProgressBar, ROLE_TITLE, StepRow, stepHref } from "./OnboardingChecklist";

const ALL_SET: Record<string, string> = {
  CUSTOMER: "Your account is ready. Find vendors near you and book in a few clicks.",
  VENDOR: "Your shop is ready for customers. New booking requests will show up in Bookings.",
  EVENT_PLANNER: "You're ready to plan. Add vendors, budget and a timeline to your events.",
};

/**
 * The welcome popup with the checklist (once after sign-up, or after adding a role), and the
 * "you're all set" popup once everything is done. The checklist itself lives in notifications.
 */
export default function OnboardingPopup() {
  const { data, markSeen } = useOnboarding();
  const ref = useRef<HTMLDialogElement>(null);
  const [shown, setShown] = useState<"intro" | "complete" | null>(null);

  // a short pause so the popup doesn't land on top of the page as it loads
  useEffect(() => {
    const kind = data?.popup;
    if (!kind) return;
    const t = setTimeout(() => {
      setShown(kind);
      // recorded as soon as it's on screen, so closing the tab mid-popup doesn't show it again
      markSeen(kind);
    }, 1200);
    return () => clearTimeout(t);
  }, [data?.popup, markSeen]);

  useEffect(() => {
    const d = ref.current;
    // showModal() makes the page behind inert and traps focus; Esc (and back gestures) close it
    if (shown && d && !d.open) d.showModal();
  }, [shown]);

  if (!data || !shown) return null;

  // every way of closing (button, link, Esc) goes through the dialog's close event
  const close = () => ref.current?.close();
  const onClose = () => setShown(null);
  const next = data.steps.find((s) => s.state === "todo" && stepHref(data.role, s.key));

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="onboarding-title"
      className="w-[calc(100%-2rem)] max-w-md rounded-2xl p-0 bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-xl overscroll-contain backdrop:bg-black/60 backdrop:overflow-hidden backdrop:overscroll-contain"
    >
      <div className="p-6 space-y-4">
        {shown === "complete" ? (
          <div className="text-center space-y-3">
            <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto" aria-hidden />
            <h2 id="onboarding-title" className="text-xl font-bold">
              You&apos;re all set
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{ALL_SET[data.role]}</p>
            <button
              type="button"
              onClick={close}
              autoFocus
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 id="onboarding-title" className="text-xl font-bold">
                Welcome to Vendly
              </h2>
              <button type="button" onClick={close} aria-label="Close" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {ROLE_TITLE[data.role]}: {data.completed} of {data.total} done.
            </p>
            <ProgressBar done={data.completed} total={data.total} />
            <div className="max-h-80 overflow-y-auto overscroll-contain">
              {data.steps.map((step) => (
                <StepRow key={step.key} role={data.role} step={step} onOpen={close} />
              ))}
            </div>
            {next && (
              <Link
                href={stepHref(data.role, next.key)!}
                onClick={close}
                autoFocus
                className="block w-full text-center py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition"
              >
                Get started
              </Link>
            )}
            <button type="button" onClick={close} className="block mx-auto text-sm font-medium text-primary hover:underline">
              I&apos;ll do it later
            </button>
            <p className="text-xs text-center text-gray-400">You&apos;ll find this checklist in Notifications.</p>
          </>
        )}
      </div>
    </dialog>
  );
}
