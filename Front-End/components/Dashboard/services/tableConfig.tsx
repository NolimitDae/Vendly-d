const status: Record<string, string> = {
  active: "bg-greenBg border-greenBorder text-greenText py-1 px-4 rounded-full",
  inactive:
    "border-failedBorder bg-failedBg text-failedText py-1 px-4 rounded-full",
};

export const SERVICES_COLUMNS = [
  {
    accessor: "serviceName",
    label: "Service Name",
    width: { mobile: "120px", desktop: "160px" },
  },
  {
    accessor: "commission",
    label: "Commission",
    width: { mobile: "120px", desktop: "160px" },
  },
  {
    accessor: "services",
    label: "Services",
    width: { mobile: "120px", desktop: "160px" },
  },
  {
    accessor: "status",
    label: "Status",
    width: { mobile: "120px", desktop: "160px" },
    formatter: (value: string) => {
      return (
        <span
          className={`px-3 py-1 rounded-full border-[0.5px] whitespace-nowrap text-sm font-medium ${status[value]}`}
        >
          • {value}
        </span>
      );
    },
  },
];
