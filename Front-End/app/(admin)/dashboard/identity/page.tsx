import IdentityReviewContent from "@/components/Dashboard/identity/IdentityReviewContent";

export default function Page() {
  return (
    <div className="bg-grayBg p-4 rounded-xl mt-5 mb-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-blackColor text-lg font-semibold leading-[130%]">ID checks</h2>
        <p className="text-descriptionColor text-sm leading-[160%]">People must be verified before they can switch between customer, vendor and planner.</p>
      </div>
      <IdentityReviewContent />
    </div>
  );
}
