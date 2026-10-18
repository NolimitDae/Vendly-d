"use client";

import { useSearchParams, useRouter } from "next/navigation";
import DashboardContainer from "@/components/Dashboard/DashboardContainer";
import BackIcon from "../../../components/Dashboard/auth/BackIcon";
import AuthRightSection from "../../../components/Dashboard/auth/AuthRightSection";
import OtpForm from "../../../components/Dashboard/auth/otp/OtpForm";
import { AuthService } from "@/service/auth/auth.service";
import { toast } from "react-toastify";

const OTPPageContent = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get("email") ?? "";
  const purpose = searchParams.get("purpose") ?? "verify";

  const handleComplete = async (otp: string) => {
    if (purpose === "verify") {
      const res = await AuthService.verifyEmail({ email, token: otp });
      if (!res.data?.success) {
        throw new Error(res.data?.message || "Verification failed");
      }
      router.push("/login");
    } else {
      router.push(
        `/change-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(otp)}`,
      );
    }
  };

  const resend = async () => {
    try {
      await AuthService.resendVerification(email);
      toast.success("A new code is on its way");
    } catch {
      toast.error("Could not resend. Try again in a minute.");
    }
  };

  return (
    <DashboardContainer className="flex flex-col lg:flex-row min-h-screen">
      <div className="flex justify-center items-center w-full lg:w-1/2 px-4">
        <div className="w-full max-w-[28rem] flex flex-col justify-center space-y-8">
          <div className="space-y-6">
            <BackIcon />
            <div className="space-y-2">
              <h2 className="text-blackColor text-2xl sm:text-[2rem] font-semibold leading-[130%]">
                Enter OTP
              </h2>
              <p className="text-descriptionColor text-base leading-[160%]">
                We have sent a code to your registered email address
                {email ? ` ${email}` : ""}.
              </p>
            </div>
          </div>
          <OtpForm onComplete={handleComplete} />
          {purpose === "verify" && email && (
            <button type="button" onClick={resend} className="text-sm text-descriptionColor underline">
              Didn&apos;t get a code? Resend
            </button>
          )}
        </div>
      </div>
      <AuthRightSection />
    </DashboardContainer>
  );
};

export default OTPPageContent;
