"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-toastify";
import {
  Check,
  Star,
  AlertCircle,
  Loader2,
  X,
  Zap,
  Crown,
  Shield,
  Sparkles,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SubscriptionService } from "@/service/subscription/subscription.service";
import dayjs from "dayjs";

/* ─── Plan data (static — backend schema lacks price/commission fields) ─── */
interface PlanDef {
  id: string;
  name: string;
  tier: number;
  monthlyPrice: number;
  commission: number;
  trialDays?: number;
  features: string[];
  badge?: string;
  icon: React.FC<{ className?: string }>;
  colorClass: string;
  ringClass: string;
  popular?: boolean;
}

const PLANS: PlanDef[] = [
  {
    id: "free_trial",
    name: "Free Trial",
    tier: 0,
    monthlyPrice: 0,
    commission: 10,
    trialDays: 14,
    badge: undefined,
    icon: Zap,
    colorClass: "from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-750",
    ringClass: "border-gray-200 dark:border-gray-700",
    features: [
      "14-day free trial",
      "Up to 3 listings",
      "Basic analytics",
      "10% platform commission",
      "Community support",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    tier: 1,
    monthlyPrice: 15,
    commission: 10,
    badge: undefined,
    icon: Shield,
    colorClass: "from-blue-50 to-blue-100 dark:from-blue-950/40 dark:to-blue-900/20",
    ringClass: "border-blue-200 dark:border-blue-800",
    features: [
      "Unlimited listings",
      "Basic analytics",
      "Email support",
      "10% platform commission",
      "Standard profile",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tier: 2,
    monthlyPrice: 30,
    commission: 8,
    badge: "★ Pro",
    icon: Star,
    colorClass: "from-violet-50 to-purple-100 dark:from-violet-950/40 dark:to-purple-900/30",
    ringClass: "border-violet-400 dark:border-violet-500",
    popular: true,
    features: [
      "Unlimited listings",
      "Advanced analytics",
      "Priority support",
      "Featured in marketplace",
      "8% platform commission",
      "★ Pro badge on profile",
    ],
  },
  {
    id: "elite",
    name: "Elite",
    tier: 3,
    monthlyPrice: 60,
    commission: 6,
    badge: "★★ Elite",
    icon: Crown,
    colorClass: "from-amber-50 to-yellow-100 dark:from-amber-950/40 dark:to-yellow-900/20",
    ringClass: "border-amber-300 dark:border-amber-600",
    features: [
      "Everything in Pro",
      "★★ Elite badge on profile",
      "Dedicated account manager",
      "6% platform commission",
      "Early access to new features",
      "Custom promotional tools",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    tier: 4,
    monthlyPrice: 100,
    commission: 5,
    badge: "★★★ Premium",
    icon: Sparkles,
    colorClass: "from-rose-50 to-pink-100 dark:from-rose-950/40 dark:to-pink-900/20",
    ringClass: "border-rose-400 dark:border-rose-500",
    features: [
      "Everything in Elite",
      "★★★ Premium badge on profile",
      "5% platform commission",
      "Zero-wait priority support",
      "Custom promotional campaigns",
      "Revenue insights dashboard",
    ],
  },
];

const ANNUAL_DISCOUNT = 0.8; // 20% off

interface CurrentPlan {
  planId: string | null;
  planName: string | null;
  status: string | null;
  billing: string | null;
  startDate: string | null;
  endDate: string | null;
}

function SubscriptionPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");

  const [annual, setAnnual] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<CurrentPlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  useEffect(() => {
    SubscriptionService.getCurrentPlan()
      .then((res) => {
        if (res.data?.success && res.data.data) {
          const d = res.data.data;
          const sub = d.subscription ?? d;
          const vsp = d.vendorPlan ?? d.vendorSubscriptionPlan ?? null;
          setCurrentPlan({
            planId: sub?.name?.toLowerCase().replace(/\s+/g, "_") ?? null,
            planName: sub?.name ?? null,
            status: vsp?.payment_status ?? sub?.status ?? null,
            billing: sub?.billing_cycle ?? null,
            startDate: vsp?.start_date ?? null,
            endDate: vsp?.end_date ?? null,
          });
        }
      })
      .catch(() => {
        // endpoint not yet implemented — fail open
      })
      .finally(() => setLoadingPlan(false));
  }, []);

  const activePlanId = currentPlan?.planId ?? null;
  const isActivePaid =
    currentPlan !== null &&
    (currentPlan.status === "PAID" || currentPlan.status === "ACTIVE") &&
    currentPlan.planId !== "free_trial";

  const price = (plan: PlanDef) => {
    if (plan.monthlyPrice === 0) return "Free";
    const p = annual ? plan.monthlyPrice * 12 * ANNUAL_DISCOUNT : plan.monthlyPrice;
    return `$${p % 1 === 0 ? p.toFixed(0) : p.toFixed(2)}`;
  };

  const priceSuffix = (plan: PlanDef) => {
    if (plan.monthlyPrice === 0) return plan.trialDays ? `${plan.trialDays}-day trial` : "";
    return annual ? "/year" : "/mo";
  };

  const handleSubscribe = async (plan: PlanDef) => {
    if (plan.id === activePlanId) return;
    setSubscribing(plan.id);
    try {
      const billing = annual ? "yearly" : "monthly";
      const res = await SubscriptionService.subscribeToPlan(plan.id, billing);
      const url = res.data?.data?.url ?? res.data?.url;
      if (url) {
        window.location.href = url;
      } else {
        toast.error(res.data?.message || "Could not start checkout");
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || "Failed to start checkout";
      toast.error(msg);
    } finally {
      setSubscribing(null);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await SubscriptionService.cancelSubscription();
      if (res.data?.success) {
        toast.success("Subscription cancelled");
        setCurrentPlan(null);
        setShowCancel(false);
      } else {
        toast.error(res.data?.message || "Cancellation failed");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Cancellation failed");
    } finally {
      setCancelling(false);
    }
  };

  const ctaLabel = (plan: PlanDef) => {
    if (plan.id === activePlanId) return "Current Plan";
    if (plan.tier === 0) return "Start Free Trial";
    const activeTier = PLANS.find((p) => p.id === activePlanId)?.tier ?? -1;
    if (plan.tier > activeTier) return "Upgrade";
    return "Downgrade";
  };

  const ctaVariant = (plan: PlanDef): "current" | "primary" | "secondary" => {
    if (plan.id === activePlanId) return "current";
    const activeTier = PLANS.find((p) => p.id === activePlanId)?.tier ?? -1;
    if (plan.tier >= activeTier) return "primary";
    return "secondary";
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-10 px-4 md:px-8">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Reason banner */}
        {reason === "no-plan" && (
          <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl px-5 py-4">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                A subscription plan is required to create listings
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                Choose a plan below to get started. New vendors can begin with the free 14-day trial.
              </p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Subscription Plans
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xl mx-auto">
            Choose the plan that fits your business. Lower commission rates mean more revenue in your pocket.
          </p>
        </div>

        {/* Current plan summary */}
        {loadingPlan ? (
          <div className="flex items-center justify-center gap-2 text-gray-400 py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading current plan…</span>
          </div>
        ) : currentPlan?.planName ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-6 py-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Star className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium">Active Plan</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{currentPlan.planName}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-6 text-sm">
              {currentPlan.billing && (
                <div>
                  <p className="text-xs text-gray-400">Billing</p>
                  <p className="font-medium text-gray-700 dark:text-gray-300 capitalize">
                    {currentPlan.billing.toLowerCase()}
                  </p>
                </div>
              )}
              {currentPlan.startDate && (
                <div>
                  <p className="text-xs text-gray-400">Started</p>
                  <p className="font-medium text-gray-700 dark:text-gray-300">
                    {dayjs(currentPlan.startDate).format("MMM D, YYYY")}
                  </p>
                </div>
              )}
              {currentPlan.endDate && (
                <div>
                  <p className="text-xs text-gray-400">Renews / Expires</p>
                  <p className="font-medium text-gray-700 dark:text-gray-300">
                    {dayjs(currentPlan.endDate).format("MMM D, YYYY")}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-400">Status</p>
                <span className={cn(
                  "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full",
                  currentPlan.status === "PAID" || currentPlan.status === "ACTIVE"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                )}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {currentPlan.status ?? "Unknown"}
                </span>
              </div>
            </div>
            {isActivePaid && (
              <button
                onClick={() => setShowCancel(true)}
                className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 transition font-medium"
              >
                Cancel subscription
              </button>
            )}
          </div>
        ) : (
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-3 py-1.5 rounded-full">
              <Calendar className="w-3.5 h-3.5" />
              No active plan — choose one below
            </span>
          </div>
        )}

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3">
          <span className={cn("text-sm font-medium", !annual ? "text-gray-900 dark:text-white" : "text-gray-400")}>
            Monthly
          </span>
          <button
            onClick={() => setAnnual((a) => !a)}
            className={cn(
              "relative w-12 h-6 rounded-full transition-colors",
              annual ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform",
                annual ? "translate-x-6" : "translate-x-0"
              )}
            />
          </button>
          <span className={cn("text-sm font-medium", annual ? "text-gray-900 dark:text-white" : "text-gray-400")}>
            Annual
          </span>
          {annual && (
            <span className="text-xs font-semibold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
              Save 20%
            </span>
          )}
        </div>

        {/* Plan cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = plan.id === activePlanId;
            const variant = ctaVariant(plan);
            const Icon = plan.icon;

            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-2xl border-2 p-5 bg-gradient-to-b transition-shadow hover:shadow-lg",
                  plan.colorClass,
                  isCurrent ? "ring-2 ring-primary ring-offset-2 dark:ring-offset-gray-900 " + plan.ringClass : plan.ringClass,
                  plan.popular && !isCurrent && "shadow-md",
                )}
              >
                {/* Popular badge */}
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-violet-600 to-purple-500 text-white text-[11px] font-bold px-3 py-0.5 rounded-full whitespace-nowrap shadow">
                    Most Popular
                  </span>
                )}
                {isCurrent && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-[11px] font-bold px-3 py-0.5 rounded-full whitespace-nowrap shadow">
                    Current
                  </span>
                )}

                {/* Icon + name */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-white/70 dark:bg-white/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-gray-700 dark:text-gray-200" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white text-sm">{plan.name}</p>
                    {plan.badge && (
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">{plan.badge}</p>
                    )}
                  </div>
                </div>

                {/* Price */}
                <div className="mb-1">
                  <span className="text-2xl font-black text-gray-900 dark:text-white">
                    {price(plan)}
                  </span>
                  {plan.monthlyPrice > 0 && annual && (
                    <span className="ml-1 text-xs text-gray-400 line-through">
                      ${plan.monthlyPrice * 12}/yr
                    </span>
                  )}
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                    {priceSuffix(plan)}
                  </span>
                </div>

                {/* Commission chip */}
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-white/60 dark:bg-white/10 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-full mb-4 w-fit">
                  {plan.commission}% commission
                </span>

                {/* Features */}
                <ul className="space-y-1.5 mb-5 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                      <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <button
                  disabled={isCurrent || subscribing === plan.id}
                  onClick={() => handleSubscribe(plan)}
                  className={cn(
                    "w-full py-2.5 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-1.5",
                    variant === "current" &&
                      "bg-primary/10 text-primary cursor-default",
                    variant === "primary" &&
                      "bg-primary text-white hover:bg-primary/90 active:scale-95",
                    variant === "secondary" &&
                      "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600",
                    (isCurrent || subscribing !== null) && subscribing !== plan.id && "opacity-60",
                  )}
                >
                  {subscribing === plan.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null}
                  {ctaLabel(plan)}
                </button>
              </div>
            );
          })}
        </div>

        {/* Commission comparison */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4 text-sm">
            Commission Rate Comparison
          </h3>
          <div className="space-y-3">
            {PLANS.filter((p) => p.tier > 0 || p.tier === 0).map((plan) => (
              <div key={plan.id} className="flex items-center gap-3">
                <span className="w-20 text-xs text-gray-500 dark:text-gray-400 shrink-0">
                  {plan.name}
                </span>
                <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      plan.tier === 0 && "bg-gray-400",
                      plan.tier === 1 && "bg-blue-400",
                      plan.tier === 2 && "bg-violet-500",
                      plan.tier === 3 && "bg-amber-400",
                      plan.tier === 4 && "bg-rose-500",
                    )}
                    style={{ width: `${plan.commission * 10}%` }}
                  />
                </div>
                <span className={cn(
                  "w-14 text-right text-xs font-semibold",
                  plan.id === activePlanId
                    ? "text-primary"
                    : "text-gray-700 dark:text-gray-300",
                )}>
                  {plan.commission}%
                  {plan.id === activePlanId && (
                    <span className="ml-1 text-[10px] font-normal text-primary">(yours)</span>
                  )}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-gray-400">
            Lower commission = more revenue per booking. Upgrading to Premium saves you 5% on every transaction.
          </p>
        </div>

        {/* Badge preview */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4 text-sm">Profile Badge Preview</h3>
          <div className="flex flex-wrap gap-3">
            {PLANS.filter((p) => p.badge).map((plan) => (
              <div
                key={plan.id}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium",
                  plan.tier === 2 && "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-700 text-violet-700 dark:text-violet-300",
                  plan.tier === 3 && "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300",
                  plan.tier === 4 && "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-700 text-rose-700 dark:text-rose-300",
                )}
              >
                <plan.icon className="w-4 h-4" />
                {plan.badge}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-400">
            Badges appear on your vendor profile and marketplace listings, increasing trust and booking rates.
          </p>
        </div>
      </div>

      {/* Cancel confirmation modal */}
      {showCancel && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Cancel Subscription</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Are you sure? You'll lose access to premium features and your commission rate will reset.
                </p>
              </div>
              <button
                onClick={() => setShowCancel(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancel(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                Keep Plan
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {cancelling && <Loader2 className="w-4 h-4 animate-spin" />}
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VendorSubscriptionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    }>
      <SubscriptionPageInner />
    </Suspense>
  );
}
