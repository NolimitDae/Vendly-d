"use client";

import React from "react";
import { useForm } from "react-hook-form";
import CustomButton from "@/components/reusable/CustomButton";
import ReusableInput from "@/components/reusable/InputFiled/ReusableInput";
import EmailIcon from "@/icons/EmailIcon";
import LockIcon from "@/icons/LockIcon";
import { Checkbox } from "@/components/ui/checkbox";
import HorizontalLineIcon from "@/icons/HorizontalLineIcon";
import AppleIconBlack from "@/icons/AppleIconBlack";
import GoogleIcon from "@/icons/GoogleIcon";
import GenericButton from "../GenericButton";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthService } from "@/service/auth/auth.service";
import { CookieHelper } from "@/helper/cookie.helper";
import { toast } from "react-toastify";
import { ShieldCheck } from "lucide-react";

type FormValues = {
  email: string;
  password: string;
};

const LoginForm = () => {
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [twoFARequired, setTwoFARequired] = React.useState(false);
  const [twoFACode, setTwoFACode] = React.useState("");
  const [pendingCredentials, setPendingCredentials] = React.useState<FormValues | null>(null);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    mode: "onChange",
  });

  const doLogin = async (email: string, password: string, token?: string) => {
    const res = await AuthService.login({ email, password, token });
    if (res.data?.success) {
      const accessToken = res.data.authorization?.access_token;
      const userType = res.data.type;
      if (accessToken) {
        CookieHelper.set({ key: "token", value: accessToken });
      }
      toast.success("Welcome back!");
      if (userType === "ADMIN") {
        router.push("/dashboard");
      } else if (userType === "VENDOR") {
        router.push("/vendor/listings");
      } else if (userType === "EVENT_PLANNER") {
        router.push("/event-planner/profile");
      } else {
        router.push("/marketplace");
      }
      return true;
    }
    return false;
  };

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    try {
      await doLogin(data.email, data.password);
    } catch (err: any) {
      const msg: string = err?.response?.data?.message ?? "";
      if (msg === "Token is required") {
        setPendingCredentials(data);
        setTwoFARequired(true);
      } else {
        toast.error(msg || "Login failed. Check your credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  const onSubmit2FA = async () => {
    if (!pendingCredentials || twoFACode.length !== 6) {
      toast.error("Enter the 6-digit code from your authenticator app");
      return;
    }
    setLoading(true);
    try {
      const ok = await doLogin(pendingCredentials.email, pendingCredentials.password, twoFACode);
      if (!ok) {
        toast.error("Invalid 2FA code — try again");
      }
    } catch (err: any) {
      const msg: string = err?.response?.data?.message ?? "";
      toast.error(msg || "Invalid 2FA code — try again");
    } finally {
      setLoading(false);
    }
  };

  // ── 2FA challenge screen ──
  if (twoFARequired) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Two-Factor Authentication
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Enter the 6-digit code from your authenticator app.
            </p>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1.5">
            Verification code
          </label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={twoFACode}
            onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-primary"
            autoFocus
          />
        </div>

        <GenericButton
          type="button"
          variant="primary"
          size="md"
          rounded="2xl"
          fullWidth
          height="lg"
          disabled={twoFACode.length !== 6 || loading}
          onClick={onSubmit2FA}
        >
          {loading ? "Verifying…" : "Verify & Log in"}
        </GenericButton>

        <button
          type="button"
          onClick={() => { setTwoFARequired(false); setTwoFACode(""); setPendingCredentials(null); }}
          className="w-full text-center text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
        >
          Back to login
        </button>
      </div>
    );
  }

  // ── Normal login screen ──
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <div className="space-y-4">
        {/* Email */}
        <ReusableInput
          label="Email"
          type="email"
          icon={<EmailIcon />}
          containerClassName="w-full"
          placeholder="sarahjohnson@mail.com"
          className="rounded-2xl"
          {...register("email", {
            required: "Email is required",
            pattern: {
              value: /^\S+@\S+$/i,
              message: "Invalid email address",
            },
          })}
          error={errors.email?.message}
        />

        {/* Password */}
        <ReusableInput
          label="Password"
          type={showPassword ? "text" : "password"}
          icon={<LockIcon />}
          className="rounded-2xl"
          placeholder="•••••••••"
          showPassword={showPassword}
          togglePasswordVisibility={() => setShowPassword((prev) => !prev)}
          {...register("password", {
            required: "Password is required",
            minLength: {
              value: 6,
              message: "Minimum 6 characters",
            },
          })}
          error={errors.password?.message}
        />

        {/* Remember + Forgot */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox />
            <span className="text-xs text-descriptionColor">Remember me</span>
          </div>
          <Link
            href="/forget-password"
            className="text-sm bg-gradient-to-r from-purpleOne via-purpleTwo to-purpleThree bg-clip-text text-transparent cursor-pointer"
          >
            Forgot your password?
          </Link>
        </div>
      </div>

      {/* Submit */}
      <GenericButton
        type="submit"
        variant="primary"
        size="md"
        rounded="2xl"
        fullWidth
        height="lg"
        disabled={!isValid || loading}
      >
        {loading ? "Logging in…" : "Log in"}
      </GenericButton>

      <p className="text-center text-sm text-descriptionColor">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="bg-gradient-to-r from-purpleOne via-purpleTwo to-purpleThree bg-clip-text text-transparent font-medium"
        >
          Sign up
        </Link>
      </p>

      {/* Social login */}
      <div className="space-y-4">
        <div className="flex justify-center items-center gap-2">
          <HorizontalLineIcon />
          <p className="text-center text-descriptionColor text-sm whitespace-nowrap">
            Or continue with
          </p>
          <HorizontalLineIcon />
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <CustomButton className="flex-1 flex items-center justify-center gap-2 w-full border border-borderColor rounded-2xl py-2 px-3 h-12">
            <GoogleIcon />
            Google
          </CustomButton>
          <CustomButton className="flex-1 flex items-center justify-center gap-2 w-full border border-borderColor rounded-2xl py-2 px-3 h-12">
            <AppleIconBlack />
            Apple
          </CustomButton>
        </div>
      </div>
    </form>
  );
};

export default LoginForm;
