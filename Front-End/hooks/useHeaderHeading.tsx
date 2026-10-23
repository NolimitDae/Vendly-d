export const useHeaderHeading = ({ path }: { path: string }) => {
    switch (path) {
        case "/dashboard":
            return { heading: "Welcome back", description: "Good morning" }
        case "/dashboard/vendors":
            return { heading: "Vendor Management", description: "Manage and monitor all registered vendors" }
        case "/dashboard/vendors/pending-requests":
            return { heading: "Vendor Subscription Requests", description: "Review and approve/reject vendor subscription requests" }
        case "/dashboard/event-planners":
            return { heading: "Event Planner Management", description: "Manage and monitor all registered event planners" }
        case "/dashboard/event-planners/pending-requests":
            return { heading: "Event Planner Subscription Requests", description: "Review and approve/reject event planner subscription requests" }
        case "/dashboard/bookings":
            return { heading: "Booking Management", description: "View and manage all bookings" }
        case "/dashboard/transactions":
            return { heading: "Transaction Management", description: "Monitor and manage all transactions" }
        case "/dashboard/services":
            return { heading: "Service Management", description: "Manage platform services" }
        case "/dashboard/disputes":
            return { heading: "Disputes", description: "Resolve problems customers reported" }
        case "/dashboard/identity":
            return { heading: "ID checks", description: "Verify people before they switch roles" }
        case "/dashboard/chat-reports":
            return { heading: "Chat reports", description: "People reported from chat" }
        case "/dashboard/promos":
            return { heading: "Promo Codes", description: "Create and manage discount codes" }
        case "/dashboard/revenue":
            return { heading: "Revenue", description: "Money in, fees, refunds and payouts" }
        case "/dashboard/settings":
            return { heading: "Platform Settings", description: "Configure platform settings and preferences" }
        default:
            return { heading: "Dashboard", description: "View dashboard summary" }
    }
}