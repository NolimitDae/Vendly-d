import ApostropheIcon from '@/icons/ApostropheIcon'
import Image from 'next/image'
import React from 'react'

interface CustomerCardProps {
    item: {
        name: string;
        title: string;
        image: string;
        description: string;
    }
}

const CustomerCard = ({ item }: CustomerCardProps) => {
    return (
        <div className='space-y-9 rounded-2xl p-3 sm:p-6
         border-[0.5px] border-borderColor bg-white hover:border-purpleOne hover:shadow-lg transition-all duration-300'>
            <div className='flex flex-col space-y-4'>
                <ApostropheIcon />
                <p className='text-sm sm:text-base font-normal text-descriptionColor leading-[160%] '>{item.description}</p>
            </div>

            <div className='flex items-center gap-3'>
                <div className='w-10 h-10 rounded-full overflow-hidden'>
                    <Image
                        src={item.image}
                        alt={item.name}
                        width={40}
                        height={40}
                        className="h-auto"
                    />
                </div>
                <div className='space-y-1'>
                    <h3 className='text-base sm:text-lg font-medium text-blackColor'>{item.name}</h3>
                    <span className='text-xs  font-normal text-descriptionColor leading-[160%]'>{item.title}</span>
                </div>
            </div>
        </div>
    )
}

export default CustomerCard