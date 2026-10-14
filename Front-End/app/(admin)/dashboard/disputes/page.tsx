import DisputesPageContent from "@/components/Dashboard/money/DisputesPageContent";

export default function Page() {
  return (
    <div className="bg-grayBg p-4 rounded-xl mt-5 mb-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-blackColor text-lg font-semibold leading-[130%]">Disputes</h2>
        <p className="text-descriptionColor text-sm leading-[160%]">Problems customers reported. The money stays held until you decide.</p>
      </div>
      <DisputesPageContent />
    </div>
  );
}
