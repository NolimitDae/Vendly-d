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

type FormValues = {
  email: string;
  password: string;
};

const LoginForm = () => {
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    mode: "onChange",
  });

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    try {
      const res = await AuthService.login(data);
      if (res.data?.success) {
        const token = res.data.authorization?.access_token;
        const userType = res.data.type;
        if (token) {
          CookieHelper.set({ key: "token", value: token });
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
      } else {
        toast.error(res.data?.message || "Invalid credentials");
      }
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || "Login failed. Check your credentials.",
      );
    } finally {
      setLoading(false);
    }
  };

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
