import Image from "next/image";


const paymentStatus: Record<string, string> = {
    Paid: "bg-greenBg border-greenBorder text-greenText py-1 px-4 rounded-full",
    Pending: "border-warningBorder bg-pendingBg text-pendingText py-1 px-4 rounded-full",
    Refunded: "border-refundBorder bg-refundBg text-refundText py-1 px-3 rounded-full"
}

const progressStatus: Record<string, string> = {
    Complete: "bg-greenBg border-greenBorder text-greenText py-1 px-4 rounded-full",
    "In Progress": "border-warningBorder bg-pendingBg text-pendingText py-1 px-4 rounded-full",
    Pending: "border-refundBorder bg-refundBg text-refundText py-1 px-3 rounded-full"
}

export const BOOKING_COLUMNS = [
    {
        accessor: "bookingId",
        label: "Booking ID",
        width: { mobile: "120px", desktop: "160px" },
    },

    {
        accessor: "info",
        label: "Planner Name",
        width: { mobile: "180px", desktop: "270px" },
        formatter: (value: any) => (
            <div className="flex items-center gap-2 w-max">
                <Image
                    src={value?.image || "/no-image.jpg"}
                    alt="planner"
                    width={34}
                    height={34}
                    className="rounded-full w-[34px] h-[34px]"
                />
                <div className="flex flex-col">
                    <span className="text-sm font-medium leading-[160%] text-blackColor">
                        {value?.eventName}
                    </span>
                    <span className="text-xs text-descriptionColor leading-[160%]">
                        {value?.date}
                    </span>
                </div>
            </div>
        ),
    },

    {
        accessor: "customer",
        label: "Customer",
        width: { mobile: "120px", desktop: "180px" },
    },

    {
        accessor: "totalVendor",
        label: "Total Vendor",
        width: { mobile: "120px", desktop: "150px" },
    },

    {
        accessor: "eventDate",
        label: "Event Date",
        width: { mobile: "120px", desktop: "180px" },
    },

    {
        accessor: "amount",
        label: "Amount",
        width: { mobile: "120px", desktop: "150px" },
    },

    {
        accessor: "payment",
        label: "Payment",
        width: { mobile: "100px", desktop: "140px" },
        formatter: (value: string) => (
            <div className="flex items-center gap-2">
                <span className={`text-sm font-medium leading-[160%] border-[0.5px] whitespace-nowrap ${paymentStatus[value]}`}>
                    {value}
                </span>
            </div>
        )
    },

    {
        accessor: "status",
        label: "Status",
        width: { mobile: "100px", desktop: "140px" }, formatter: (value: string) => (
            <div className="flex items-center gap-2">
                <span className={`text-sm font-medium leading-[160%] border-[0.5px] whitespace-nowrap ${progressStatus[value]}`}>
                    {value}
                </span>
            </div>
        )
    },
];