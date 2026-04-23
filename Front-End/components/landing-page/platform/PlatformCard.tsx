import React from 'react'
import PlatmorSearch from '@/icons/PlatmorSearch'

interface PlatformCardProps {
    items: {
        icon: React.ReactNode;
        title: string;
        description: string;
    };
    isFirst?: boolean;
}

const PlatformCard = ({ items, isFirst }: PlatformCardProps) => {
    return (
        <div className={`flex flex-col gap-4 rounded-xl  p-5 ${isFirst ? 'gradient-bg' : 'border-l-4 border-l-purpleOne bg-transparent'} `} >
            <div className='flex items-center gap-3'>
                {items.icon}
                <h3 className={`text-xl sm:text-2xl font-semibold leading-[160%] ${isFirst ? 'text-white' : 'text-blackColor'}`}>{items.title}</h3>

            </div>
            <p className={`text-base font-normal leading-[160%] ${isFirst ? 'text-white/90' : 'text-descriptionColor'}`}>{items.description}</p>
        </div>
    )
}

export default PlatformCard