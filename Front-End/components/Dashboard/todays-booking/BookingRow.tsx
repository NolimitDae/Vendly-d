import CalenderIcon from '@/icons/CalenderIcon'
import React from 'react'

interface BookingRowProps {
    label: string;
    value: number;
    icon: React.ReactNode;
}

const BookingRow = ({ label, value, icon }: BookingRowProps) => {
  return (
    <div className='flex items-center justify-between'>
        <div className='flex items-center gap-1.5'>
            {icon} 
            <p className='text-sm font-medium leading-[160%] text-descriptionColor'>{label}</p>
        </div>
        <span className='text-sm font-semibold leading-[160%] text-grayColor2'>{value}</span>
    </div>
  )
}

export default BookingRow