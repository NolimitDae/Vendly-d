import Image from "next/image";

export const EVENT_PLANNERS_COLUMNS = [
    {
        accessor: "plannerName",
        label: "Planner Name",
        width: { mobile: "100px", desktop: "200px" },
        formatter: (value: any) => <div className="flex items-center gap-2">
            <Image src={value?.image || "/no-image.jpg"} alt="delete" width={34} height={34} className="rounded-full w-[34px] h-[34px] cursor-pointer" />
            <div className="flex flex-col">
                <span className="text-sm font-medium leading-[160%] text-blackColor">{value?.name}</span>
                <span className="text-xs text-descriptionColor leading-[160%]">{value?.joinedDate}</span>
            </div>
        </div>
    },
    {
        accessor: "eventType",
        label: "Event Type",
        width: { mobile: "100px", desktop: "200px" }
    },
    {
        accessor: "services",
        label: "Services",
        width: { mobile: "100px", desktop: "200px" }
    },
    {
        accessor: "subscription",
        label: "Subscription",
        width: { mobile: "100px", desktop: "200px" }
    },
    {
        accessor: "totalBookings",
        label: "Total Bookings",
        width: { mobile: "100px", desktop: "200px" }
    },

]

export const EVENT_TYPE_OPTIONS = [
    { label: "All Categories", value: "all" },
    { label: "Wedding", value: "Wedding" },
    { label: "Salon", value: "Salon" },
    { label: "Cars", value: "Cars" },
    { label: "Photography", value: "Photography" },
    { label: "Corporate", value: "Corporate" },
    { label: "Makeup", value: "Makeup" },
    { label: "Repair", value: "Repair" },
    { label: "Gardening", value: "Gardening" },
    { label: "Catering", value: "Catering" },
    { label: "Personal Training", value: "Personal Training" },
    { label: "Tours", value: "Tours" },
    { label: "Cleaning", value: "Cleaning" },
    { label: "Care", value: "Care" },
    { label: "Yoga", value: "Yoga" },
    { label: "DJ", value: "DJ" },
    { label: "Electrical", value: "Electrical" },
    { label: "Laundry", value: "Laundry" },
    { label: "Digital", value: "Digital" },
    { label: "Tutoring", value: "Tutoring" },
    { label: "Street Food", value: "Street Food" },
    { label: "Interior", value: "Interior" },
    { label: "Bike", value: "Bike" },
    { label: "Spa", value: "Spa" },
    { label: "Guard", value: "Guard" },
    { label: "Plumbing", value: "Plumbing" },
    { label: "Delivery", value: "Delivery" },
    { label: "Gaming", value: "Gaming" }
];

export const STATUS_OPTIONS = [
    { label: "All Status", value: "all" },
    { label: "Monthly", value: "Monthly" },
    { label: "Yearly", value: "Yearly" },
]

export const PLAN_OPTIONS = [
    { label: "All Plans", value: "all" },
    { label: "Home", value: "Home" },
    { label: "Location", value: "Location" },
    { label: "Mobile", value: "Mobile"}, 
    { label: "On site", value: "on-site" }
]