import RevenuePageContent from "@/components/Dashboard/money/RevenuePageContent";

export default function Page() {
  return (
    <div className="bg-grayBg p-4 rounded-xl mt-5 mb-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-blackColor text-lg font-semibold leading-[130%]">Revenue</h2>
        <p className="text-descriptionColor text-sm leading-[160%]">Money collected, Vendly fees and commission, refunds and vendor payouts by day.</p>
      </div>
      <RevenuePageContent />
    </div>
  );
}
