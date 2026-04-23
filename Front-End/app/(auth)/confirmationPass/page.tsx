import DashboardContainer from "@/components/Dashboard/DashboardContainer";
import Image from "next/image";
import React from "react";
import AuthRightSection from "../../../components/Dashboard/auth/AuthRightSection";
import ConfirmationPassForm from "@/components/Dashboard/auth/confirmation-pass/ConfirmationPassForm";
import CircleTickIcon from "@/icons/CircleTickIcon";
import ConfirmIcon from "@/icons/ConfirmIcon";

const LoginPage = () => {

    return (
        <DashboardContainer className="flex flex-col lg:flex-row min-h-screen">

            {/* LEFT SECTION */}
            <div className="flex justify-center items-center w-full lg:w-1/2 px-4">
                <div className="w-full max-w-[28rem] flex flex-col justify-center  space-y-8">

                    {/* Header */}
                    <div className="rounded-full flex justify-center">
                        <ConfirmIcon />
                    </div>
                    <div className="text-center space-y-2">
                        <h2 className="text-blackColor text-[32px] sm:text-[2rem] font-semibold leading-[130%]">You're All Set!</h2>
                        <p className="text-descriptionColor text-base leading-[160%]">Your password has been successfully updated.
                            You can now sign in with your new password.</p>
                    </div>

                    {/* Form */}
                    <ConfirmationPassForm />

                </div>
            </div>

            {/* RIGHT SECTION */}
            <AuthRightSection />

        </DashboardContainer>
    );
};

export default LoginPage;