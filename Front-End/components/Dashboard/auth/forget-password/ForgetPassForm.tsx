"use client";

import ReusableInput from "@/components/reusable/InputFiled/ReusableInput";
import EmailIcon from "@/icons/EmailIcon";
import { GenericButton } from "../GenericButton";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthService } from "@/service/auth/auth.service";
import { toast } from "react-toastify";

const ForgetPassForm = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email) {
      toast.error("Please enter your email address");
      return;
    }
    setLoading(true);
    try {
      const res = await AuthService.forgotPassword(email);
      if (res.data?.success) {
        toast.success("OTP sent to your email");
        router.push(`/otp?email=${encodeURIComponent(email)}&purpose=reset`);
      } else {
        toast.error(res.data?.message || "Failed to send OTP");
      }
    } catch {
      toast.error("Failed to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <ReusableInput
          label="Email"
          type="email"
          icon={<EmailIcon />}
          containerClassName="w-full"
          placeholder="sarahjohnson@mail.com"
          className="rounded-2xl"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <GenericButton
        variant="primary"
        size="md"
        fullWidth
        rounded="2xl"
        height="lg"
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? "Sending…" : "Send OTP"}
      </GenericButton>
    </div>
  );
};

export default ForgetPassForm;
