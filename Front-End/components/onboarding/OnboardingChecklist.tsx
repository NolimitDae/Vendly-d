"use client";

import Link from "next/link";
import { CheckCircle2, ChevronRight, Circle, Clock, Smartphone } from "lucide-react";
import type { Onboarding, OnboardingRole, OnboardingStep } from "@/service/onboarding/onboarding.service";
import { cn } from "@/lib/utils";

export const ROLE_TITLE: Record<OnboardingRole, string> = {
  CUSTOMER: "Get set up to book",
  VENDOR: "Get your shop ready",
  EVENT_PLANNER: "Get set up to plan",
};

/** Where each step is done on the website. Steps missing here are done in the app. */
const LINKS: Record<OnboardingRole, Record<string, string>> = {
  CUSTOMER: {
    verify_id: "/settings/verify-id",
    add_card: "/settings/payment-methods",
    profile_photo: "/settings#profile",
    add_location: "/settings#profile",
  },
  VENDOR: {
    business_license: "/vendor/profile#licence",
    business_address: "/vendor/profile#business-address",
    verify_id: "/settings/verify-id",
    first_package: "/vendor/listings/new",
    payouts: "/vendor/earnings",
    booking_contract: "/vendor/contracts",
    shop_branding: "/vendor/profile",
  },
  EVENT_PLANNER: {
    planner_profile: "/event-planner/profile",
    business_license: "/event-planner/profile",
    verify_id: "/settings/verify-id",
    add_card: "/settings/payment-methods",
    first_event: "/event-planner/events/new",
  },
};

/** A verified email has nothing left to do, so it never needs a link. */
const NO_ACTION = new Set(["verify_email"]);

export const stepHref = (role: OnboardingRole, key: string): string | undefined => LINKS[role]?.[key];

export function StepRow({ role, step, onOpen }: { role: OnboardingRole; step: OnboardingStep; onOpen?: () => void }) {
  const href = step.state === "todo" ? stepHref(role, step.key) : undefined;
  const appOnly = step.state === "todo" && !href && !NO_ACTION.has(step.key);
  const body = (
    <>
      {step.state === "done" ? (
        <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" aria-hidden />
      ) : step.state === "pending" ? (
        <Clock className="w-5 h-5 text-amber-500 flex-shrink-0" aria-hidden />
      ) : (
        <Circle className="w-5 h-5 text-gray-300 dark:text-gray-600 flex-shrink-0" aria-hidden />
      )}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm font-medium",
            step.state === "done" ? "text-gray-400 line-through" : "text-gray-900 dark:text-white",
          )}
        >
          {step.title}
          <span className="sr-only">{step.state === "done" ? " (done)" : step.state === "pending" ? " (in review)" : ""}</span>
        </p>
        {step.state !== "done" && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {step.note ?? step.description}
            {appOnly && (
              <span className="inline-flex items-center gap-1 ml-1 text-primary">
                <Smartphone className="w-3 h-3" aria-hidden /> In the Vendly app
              </span>
            )}
          </p>
        )}
      </div>
      {href && <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden />}
    </>
  );
  return href ? (
    <Link href={href} onClick={onOpen} className="flex items-center gap-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/40 -mx-2 px-2 transition">
      {body}
    </Link>
  ) : (
    <div className="flex items-center gap-3 py-2.5">{body}</div>
  );
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-label="Setup progress"
      className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden"
    >
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** The "get set up" checklist at the top of notifications; it goes away once everything is done. */
export default function OnboardingChecklist({ data }: { data: Onboarding }) {
  return (
    <section aria-label={ROLE_TITLE[data.role]} className="mb-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-primary/30 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 dark:text-white">{ROLE_TITLE[data.role]}</h2>
        <span className="text-sm font-medium text-primary">
          {data.completed} of {data.total}
        </span>
      </div>
      <ProgressBar done={data.completed} total={data.total} />
      <div>
        {data.steps.map((step) => (
          <StepRow key={step.key} role={data.role} step={step} />
        ))}
      </div>
    </section>
  );
}
