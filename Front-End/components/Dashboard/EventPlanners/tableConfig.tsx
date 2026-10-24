import Image from "next/image";

export type PlannerStatus = "approved" | "pending" | "suspended" | "rejected";

export const PLANNER_STATUS_LABELS: Record<PlannerStatus, string> = {
    approved: "Approved",
    pending: "Pending",
    suspended: "Suspended",
    rejected: "Licence rejected",
};

const STATUS_STYLES: Record<PlannerStatus, string> = {
    approved: "bg-greenBg border-greenBorder text-greenText",
    pending: "border-warningBorder bg-pendingBg text-pendingText",
    suspended: "bg-red-100 text-red-600 border-red-200 dark:bg-red-900/30",
    rejected: "border-refundBorder bg-refundBg text-refundText",
};

export const PlannerStatusBadge = ({ status }: { status: PlannerStatus }) => (
    <span className={`inline-block border text-xs font-semibold py-1 px-3 rounded-full ${STATUS_STYLES[status] ?? ""}`}>
        {PLANNER_STATUS_LABELS[status] ?? status}
    </span>
);

/** Filter tabs above the list; counts come from the API. */
export const PLANNER_STATUS_TABS: { value: "all" | PlannerStatus; label: string }[] = [
    { value: "all", label: "All" },
    { value: "approved", label: "Approved" },
    { value: "pending", label: "Pending" },
    { value: "suspended", label: "Suspended" },
    { value: "rejected", label: "Licence rejected" },
];

// the EventType values planners pick on their profile
export const EVENT_TYPE_LABELS: Record<string, string> = {
    WEDDING: "Wedding",
    BIRTHDAY: "Birthday",
    CORPORATE: "Corporate",
    CONCERT: "Concert",
    CONFERENCE: "Conference",
    PRIVATE_PARTY: "Private party",
    OTHER: "Other",
};

export const EVENT_TYPE_OPTIONS = [
    { label: "All event types", value: "all" },
    ...Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => ({ label, value })),
];

export const EVENT_PLANNERS_COLUMNS = [
    {
        accessor: "plannerName",
        label: "Planner Name",
        width: { mobile: "200px", desktop: "240px" },
        formatter: (value: any) => <div className="flex items-center gap-2">
            <Image src={value?.image || "/no-image.jpg"} alt="" width={34} height={34} className="rounded-full w-[34px] h-[34px] object-cover" unoptimized />
            <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium leading-[160%] text-blackColor truncate">{value?.name}</span>
                <span className="text-xs text-descriptionColor leading-[160%]">Joined {value?.joinedDate}</span>
            </div>
        </div>
    },
    {
        accessor: "email",
        label: "Email",
        width: { mobile: "180px", desktop: "220px" }
    },
    {
        accessor: "eventTypes",
        label: "Event Types",
        width: { mobile: "150px", desktop: "180px" }
    },
    {
        accessor: "totalEvents",
        label: "Events",
        width: { mobile: "80px", desktop: "100px" }
    },
    {
        accessor: "totalBookings",
        label: "Bookings",
        width: { mobile: "90px", desktop: "110px" }
    },
    {
        accessor: "status",
        label: "Status",
        width: { mobile: "140px", desktop: "160px" },
        formatter: (value: PlannerStatus) => <PlannerStatusBadge status={value} />
    },
    {
        accessor: "actions",
        label: "Action",
        width: { mobile: "190px", desktop: "200px" },
        formatter: (value: any) => (
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={value?.onView}
                    aria-label={`View ${value?.name}`}
                    className="text-xs font-semibold px-3 py-1 rounded-full border border-borderColor text-blackColor hover:bg-white dark:hover:bg-gray-700"
                >
                    View
                </button>
                <button
                    type="button"
                    onClick={value?.onToggle}
                    aria-label={`${value?.suspended ? "Reactivate" : "Suspend"} ${value?.name}`}
                    className={`text-xs font-semibold px-3 py-1 rounded-full ${value?.suspended ? "bg-green-100 text-green-700 dark:bg-green-900/30" : "bg-red-100 text-red-600 dark:bg-red-900/30"}`}
                >
                    {value?.suspended ? "Reactivate" : "Suspend"}
                </button>
            </div>
        ),
    },
]
