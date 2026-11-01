import ContactMessagesContent from "@/components/Dashboard/contact-messages/ContactMessagesContent";

export default function Page() {
  return (
    <div className="bg-grayBg p-4 rounded-xl mt-5 mb-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-blackColor text-lg font-semibold leading-[130%]">Contact messages</h2>
        <p className="text-descriptionColor text-sm leading-[160%]">What people sent from the website&apos;s Contact us page.</p>
      </div>
      <ContactMessagesContent />
    </div>
  );
}
