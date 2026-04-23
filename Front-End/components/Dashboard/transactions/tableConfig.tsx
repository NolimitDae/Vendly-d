import Image from "next/image";

const paymentStatus: Record<string, string> = {
  Successful:
    "bg-greenBg border-greenBorder text-greenText py-1 px-4 rounded-full",
  Failed:
    "border-failedBorder bg-failedBg text-failedText py-1 px-4 rounded-full",
  Refunded:
    "border-refundBorder bg-refundBg text-refundText py-1 px-3 rounded-full",
};

export const TRANSACTIONS_COLUMNS = [
  {
    accessor: "transactionId",
    label: "Transaction ID",
    width: { mobile: "120px", desktop: "180px" },
  },
  {
    accessor: "bookingId",
    label: "Booking ID",
    width: { mobile: "120px", desktop: "180px" },
  },
  {
    accessor: "payerName",
    label: "Payer Name",
    width: { mobile: "140px", desktop: "200px" },
  },
  {
    accessor: "payeeName",
    label: "Payee Name",
    width: { mobile: "140px", desktop: "200px" },
  },
  {
    accessor: "amount",
    label: "Amount",
    width: { mobile: "100px", desktop: "150px" },
    formatter: (value: number) => (
      <span className="text-sm font-medium text-blackColor">
        ${value.toLocaleString()}
      </span>
    ),
  },
  {
    accessor: "platformFee",
    label: "Platform Fee",
    width: { mobile: "120px", desktop: "160px" },
    formatter: (value: number) => (
      <span className="text-sm text-descriptionColor">
        ${value.toLocaleString()}
      </span>
    ),
  },
  {
    accessor: "status",
    label: "Status",
    width: { mobile: "120px", desktop: "160px" },
    formatter: (value: string) => {
      return (
        <span
          className={`px-3 py-1 rounded-full border-[0.5px] whitespace-nowrap text-sm font-medium ${paymentStatus[value]}`}
        >
          • {value}
        </span>
      );
    },
  },
  {
    accessor: "dateTime",
    label: "Date & Time",
    width: { mobile: "160px", desktop: "220px" },
  },
];

export const TRANSACTION_STATUS_OPTIONS = [
  { label: "All Status", value: "all" },
  { label: "Successful", value: "Successful" },
  { label: "Failed", value: "Failed" },
  { label: "Refunded", value: "Refunded" },
];
