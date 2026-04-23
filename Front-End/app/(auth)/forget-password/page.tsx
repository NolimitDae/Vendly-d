import DashboardContainer from "@/components/Dashboard/DashboardContainer";
import AuthRightSection from "../../../components/Dashboard/auth/AuthRightSection";
import ForgetPassForm from "../../../components/Dashboard/auth/forget-password/ForgetPassForm";
import BackIcon from "../../../components/Dashboard/auth/BackIcon";

const ForgetPasswordPage = () => {
  return (
    <DashboardContainer className="flex flex-col lg:flex-row min-h-screen">
      {/* LEFT SECTION */}
      <div className="flex justify-center items-center w-full lg:w-1/2 px-4">
        <div className="w-full max-w-[28rem] flex flex-col justify-center space-y-8">
          {/* Header */}
          <div className="space-y-6">
            <BackIcon />
            <div className="space-y-2">
              <h2 className="text-blackColor text-2xl sm:text-[2rem] font-semibold leading-[130%]">
                Enter Password
              </h2>
              <p className="text-descriptionColor text-base leading-[160%]">
                Enter your registered email address. we’ll send you a code to
                reset your password.
              </p>
            </div>
          </div>

          {/* Form */}
          <ForgetPassForm />
        </div>
      </div>

      {/* RIGHT SECTION */}
      <AuthRightSection />
    </DashboardContainer>
  );
};

export default ForgetPasswordPage;
