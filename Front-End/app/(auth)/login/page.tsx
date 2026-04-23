import DashboardContainer from "@/components/Dashboard/DashboardContainer";
import Image from "next/image";
import React from "react";
import AuthRightSection from "../../../components/Dashboard/auth/AuthRightSection";
import LoginForm from "@/components/Dashboard/auth/login/LoginForm";

const LoginPage = () => {

  return (
    <DashboardContainer className="flex flex-col lg:flex-row min-h-screen">

      {/* LEFT SECTION */}
      <div className="flex justify-center items-center w-full lg:w-1/2 px-4">
        <div className="w-full max-w-[28rem] flex flex-col justify-center space-y-8">

          {/* Header */}
          <div className="space-y-6">
            <Image
              src={"/site_logo.png"}
              width={40}
              height={40}
              alt="login image"
            />
            <div className="space-y-2">
              <h2 className="text-blackColor text-2xl sm:text-[2rem] font-semibold leading-[130%]">
                Login to your account
              </h2>
              <p className="text-descriptionColor text-base leading-[160%]">
                Enter your email and password to log in
              </p>
            </div>
          </div>

          {/* Form */}
          <LoginForm />

        </div>
      </div>

      {/* RIGHT SECTION */}
      <AuthRightSection />

    </DashboardContainer>
  );
};

export default LoginPage;