import PromosPageContent from "@/components/Dashboard/money/PromosPageContent";

export default function Page() {
  return (
    <div className="bg-grayBg p-4 rounded-xl mt-5 mb-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-blackColor text-lg font-semibold leading-[130%]">Promo codes</h2>
        <p className="text-descriptionColor text-sm leading-[160%]">Discount codes customers can enter when they book.</p>
      </div>
      <PromosPageContent />
    </div>
  );
}
