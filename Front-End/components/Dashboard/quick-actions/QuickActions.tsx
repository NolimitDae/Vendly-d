import React from 'react'
import QuickActionsCard from './QuickActionsCard'
import VendorsIcon from '@/icons/VendorsIcon'
import EventPlannersIcon from '@/icons/EventPlannersIcon'


const quickActions = [
    {
        title: "Review Vendor Requests",
        description: "New subscription applications pending",
        icon: <VendorsIcon />,
    },
    {
        title: "Review  Planner Requests", 
        description: "NEvent planner applications pending",
        icon: <EventPlannersIcon />,
    },
    {
        title: "Failed Transactions",
        description: "Requires immediate attention",
        icon: < EventPlannersIcon/>,
    },
    {
        title: "System Allerts",
        description: "Important platform notifications",
        icon: <VendorsIcon />,
    },
]

const QuickActions = () => {
    return (
        <div className='bg-grayBg p-4 rounded-2xl space-y-3'>
            <h3 className='text-lg font-semibold text-blackColor leading-[160%]'>Quick Actions</h3>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3'>
                {quickActions.map((action, index) => (
                    <QuickActionsCard key={index} action={action} />
                ))}
            </div>
        </div>
    )
}

export default QuickActions