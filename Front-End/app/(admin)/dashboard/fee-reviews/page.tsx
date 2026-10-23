import FeeReviewsPageContent from "@/components/Dashboard/money/FeeReviewsPageContent";

export default function Page() {
  return (
    <div className="bg-grayBg p-4 rounded-xl mt-5 mb-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-blackColor text-lg font-semibold leading-[130%]">Fee reviews</h2>
        <p className="text-descriptionColor text-sm leading-[160%]">
          Fees a customer declined or didn&apos;t answer, sent by the vendor for Vendly to decide. Check the contract, then charge or waive.
        </p>
      </div>
      <FeeReviewsPageContent />
    </div>
  );
}
