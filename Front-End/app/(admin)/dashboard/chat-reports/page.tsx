import ChatReportsContent from "@/components/Dashboard/chat-reports/ChatReportsContent";

export default function Page() {
  return (
    <div className="bg-grayBg p-4 rounded-xl mt-5 mb-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-blackColor text-lg font-semibold leading-[130%]">Chat reports</h2>
        <p className="text-descriptionColor text-sm leading-[160%]">People reported from chat. Read the conversation, then dismiss the report or act on it.</p>
      </div>
      <ChatReportsContent />
    </div>
  );
}
