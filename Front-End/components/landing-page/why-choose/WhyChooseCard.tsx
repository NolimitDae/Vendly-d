import React from 'react'

interface WhyChooseCardProps {
    item: {
        icon: React.ReactNode;
        header: string;
        description: string;
    }
}

const WhyChooseCard = ({ item }: WhyChooseCardProps) => {
    return (
        <div className='flex flex-col justify-center items-center gap-4 sm:gap-12 p-3 sm:p-4 bg-white rounded-2xl border-[0.5px] border-borderColor hover:border-purpleOne hover:shadow-lg transition-all duration-300'>
            <div className='rounded-full p-[0.5px] bg-linear-to-r from-[#B09DFF] to-[#B09DFF]'>
                <div className='rounded-full flex items-center justify-center p-4.5 bg-white w-full h-full'>
                    {item.icon}
                </div>
            </div>
            <div className='flex flex-col justify-center items-center gap-2.5'>
                <h3 className='text-lg sm:text-2xl font-semibold text-blackColor leading-[130%] text-center'>{item.header}</h3>
                <p className='text-sm sm:text-base leading-[160%] text-descriptionColor text-center'>{item.description}</p>
            </div>
        </div>
    )
}

export default WhyChooseCard