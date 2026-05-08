"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { AuthService } from "@/service/auth/auth.service";
import { CookieHelper } from "@/helper/cookie.helper";
import { toast } from "react-toastify";
import { Loader2, Eye, EyeOff } from "lucide-react";

type AccountType = "CLIENT" | "VENDOR" | "EVENT_PLANNER";

const TYPE_OPTIONS: { value: AccountType; label: string; desc: string }[] = [
  { value: "CLIENT", label: "Customer", desc: "Book services from vendors" },
  { value: "VENDOR", label: "Vendor", desc: "List and sell your services" },
  { value: "EVENT_PLANNER", label: "Event Planner", desc: "Offer full event planning" },
];

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<"type" | "details">("type");
  const [accountType, setAccountType] = useState<AccountType>("CLIENT");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    business_name: "",
    phone: "",
  });
  const [errors, setErrors] = useState<Partial<typeof form>>({});

  const set = (field: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const validate = () => {
    const errs: Partial<typeof form> = {};
    if (!form.first_name.trim()) errs.first_name = "Required";
    if (!form.last_name.trim()) errs.last_name = "Required";
    if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email))
      errs.email = "Valid email required";
    if (form.password.length < 8)
      errs.password = "Minimum 8 characters";
    if (accountType !== "CLIENT" && !form.business_name.trim())
      errs.business_name = "Business name required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const payload: Record<string, string> = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        password: form.password,
        type: accountType,
      };
      if (form.business_name.trim()) payload.business_name = form.business_name.trim();
      if (form.phone.trim()) payload.phone = form.phone.trim();

      const res = await AuthService.register(payload as any);
      if (res.data?.success) {
        toast.success("Account created! Check your email to verify.");
        router.push("/login");
      } else {
        toast.error(res.data?.message || "Registration failed");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen p-5">
      {/* Left */}
      <div className="flex justify-center items-start lg:items-center w-full lg:w-1/2 px-4 py-8">
        <div className="w-full max-w-[28rem] space-y-6">
          <div className="space-y-2">
            <Image src="/site_logo.png" width={40} height={40} alt="Vendly" />
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white leading-tight">
              Create your account
            </h2>
            <p className="text-gray-500 text-sm">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Log in
              </Link>
            </p>
          </div>

          {step === "type" ? (
            <div className="space-y-4">
              <p className="font-medium text-gray-700 dark:text-gray-300">I want to join as:</p>
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAccountType(opt.value)}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition ${
                    accountType === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                  }`}
                >
                  <p className={`font-semibold ${accountType === opt.value ? "text-primary" : "text-gray-900 dark:text-white"}`}>
                    {opt.label}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">{opt.desc}</p>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setStep("details")}
                className="w-full py-3 rounded-2xl bg-primary text-white font-semibold hover:bg-primary/90 transition"
              >
                Continue
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <button
                type="button"
                onClick={() => setStep("type")}
                className="text-sm text-gray-400 hover:text-gray-600 mb-1"
              >
                ← Change account type
              </button>

              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm font-medium">
                {TYPE_OPTIONS.find((o) => o.value === accountType)?.label}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.first_name}
                    onChange={(e) => set("first_name", e.target.value)}
                    placeholder="John"
                    className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white text-sm"
                  />
                  {errors.first_name && <p className="text-red-500 text-xs mt-1">{errors.first_name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.last_name}
                    onChange={(e) => set("last_name", e.target.value)}
                    placeholder="Doe"
                    className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white text-sm"
                  />
                  {errors.last_name && <p className="text-red-500 text-xs mt-1">{errors.last_name}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="john@example.com"
                  className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white text-sm"
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full px-4 py-2.5 pr-11 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
              </div>

              {accountType !== "CLIENT" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Business Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.business_name}
                    onChange={(e) => set("business_name", e.target.value)}
                    placeholder="e.g. Smith Photography LLC"
                    className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white text-sm"
                  />
                  {errors.business_name && <p className="text-red-500 text-xs mt-1">{errors.business_name}</p>}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone (optional)
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="+1 555 000 0000"
                  className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-2xl bg-primary text-white font-semibold hover:bg-primary/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Account
              </button>

              <p className="text-xs text-gray-400 text-center">
                By registering you agree to our{" "}
                <span className="text-primary hover:underline cursor-pointer">Terms of Service</span>
                {" "}and{" "}
                <span className="text-primary hover:underline cursor-pointer">Privacy Policy</span>.
              </p>
            </form>
          )}
        </div>
      </div>

      {/* Right — gradient panel */}
      <div className="hidden lg:flex lg:w-1/2 gradient-bg items-center justify-center pl-20 pt-20 rounded-2xl">
        <div>
          <div className="mb-10">
            <Image src="/site_logo.png" width={50} height={50} alt="Vendly" />
          </div>
          <div className="space-y-2 mb-8">
            <h2 className="text-[2rem] leading-[130%] text-white">Join Vendly today</h2>
            <p className="text-white/70 text-sm leading-[160%] max-w-xs">
              Connect with customers, showcase your services, and grow your business on one powerful platform.
            </p>
          </div>
          <div className="flex gap-2 mb-10">
            <div className="w-6 h-1 bg-white rounded-lg" />
            <div className="w-3 h-1 bg-white/30 rounded-lg" />
            <div className="w-3 h-1 bg-white/30 rounded-lg" />
          </div>
          <div className="space-y-3 max-w-xs">
            {["List your services for free", "Get discovered by thousands", "Manage bookings in one place"].map((item) => (
              <div key={item} className="flex items-center gap-3 text-white/90 text-sm">
                <div className="w-2 h-2 bg-white rounded-full flex-shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
