import React from 'react'
import BookingRow from './BookingRow'
import CalenderIcon from '@/icons/CalenderIcon'
import PendingApprovalIcon from '@/icons/PendingApprovalIcon'
import FailedIcon from '@/icons/FailedIcon'
import CalenderBlack from '@/icons/CalenderBlack'

const bookingData = [
    {
        label: "Totals Bookings",
        value: 58,
        icon: <CalenderBlack />,
    },
    {
        label: "Pending Approval",
        value: 58,
        icon: <PendingApprovalIcon />,
    },
    {
        label: "Failed payments",
        value: 58,
        icon: <FailedIcon />
    }
]

const TodaysBooking = () => {
    return (
        <div className="p-4 bg-grayBg rounded-xl">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-blackColor leading-[130%]">
                    Today's Booking
                </h3>
            </div>

        
            <div className="divide-y divide-borderColor">
                {bookingData.map((item, index) => (
                    <div key={index} className="py-4">
                        <BookingRow
                            label={item.label}
                            value={item.value}
                            icon={item.icon}
                        />
                    </div>
                ))}
            </div>
        </div>
    )
}

export default TodaysBooking