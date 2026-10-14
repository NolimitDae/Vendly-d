import FeeSettings from "@/components/Dashboard/money/FeeSettings";

const SettingsPage = () => {
  return (
    <div className="bg-grayBg p-4 rounded-xl mt-5 mb-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-blackColor text-lg font-semibold leading-[130%]">Platform Configuration</h2>
        <p className="text-descriptionColor text-sm leading-[160%]">Fees, limits and feature flags. Saved to the database and used for new bookings straight away.</p>
      </div>
      <FeeSettings />
    </div>
  );
};

export default SettingsPage;
