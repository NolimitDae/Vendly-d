import ChevronRight from '@/icons/ChevronRight'
import VendorsIcon from '@/icons/VendorsIcon'
import React from 'react'

interface QuickActionsCardProps {
    action: {
        title: string;
        description: string;
        icon: React.ReactNode;
    };
}


const QuickActionsCard = ({ action }: QuickActionsCardProps) => {
    return (
        <div className='flex justify-between items-center p-3 bg-white rounded-lg'>
            <div className='flex justify-center items-center gap-1.5'>
                <div className='h-[1.983rem] w-[1.983rem] flex justify-center items-center rounded-full bg-grayBg border-[0.5px] border-grayBorder'>{action.icon}</div>
                <div>
                    <h3 className='text-sm font-medium text-blackColor leading-[160%]'>{action.title}</h3>
                    <p className='text-xs text-grayColor1 leading-[160%]'>{action.description}</p>
                </div>
            </div>
            <div>
                <ChevronRight className='cursor-pointer w-1.5 h-3' stroke='#070707' />
            </div>
        </div>
    )
}

export default QuickActionsCard