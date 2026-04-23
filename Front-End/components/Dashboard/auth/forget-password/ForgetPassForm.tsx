"use client";

import CustomButton from "@/components/reusable/CustomButton";
import ReusableInput from "@/components/reusable/InputFiled/ReusableInput";
import EmailIcon from "@/icons/EmailIcon";
import { GenericButton } from "../GenericButton";
import { useRouter } from "next/navigation";


const ForgetPassForm = () => {

const router = useRouter();
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
        />
      </div>

      <GenericButton variant="primary" size="md" fullWidth rounded="2xl" height="lg" onClick={() => router.push("/otp")}>Send OTP</GenericButton>


    </div>
  );
};

export default ForgetPassForm;
