import React from 'react'
import Container from '@/app/_components/Container'
import Image from 'next/image'
import PlatformCard from './PlatformCard'
import PlatmorSearch from '@/icons/PlatmorSearch'
import RelaxIcon from '@/icons/RelaxIcon'
import CalenderIcon from '@/icons/CalenderIcon'
import ConfirmationIcon from '@/icons/ConfirmationIcon'

const platformData = [
    {
        icon: <PlatmorSearch />,
        title: "Search & Discover",
        description: "Easily discover vendors using smart filters like category, location, budget, availability, and customer ratings"

    },
    {
        icon: <CalenderIcon />,
        title: "Booking Request",
        description: "Once the provider reviews and accepts your request, you’ll receive a confirmation to proceed securely"
    },
    {
        icon: <ConfirmationIcon />,
        title: "Confirm & Pay Securely",
        description: "Enjoy upfront pricing, flexible milestone-based payments, and a secure checkout designed to protect every transaction"
    },
    {
        icon: <RelaxIcon />,
        title: "Relax & Get It Done",
        description: "Monitor every step, communicate seamlessly with vendors, and finish each task with total confidence"
    },
]

const PlatformWork = () => {
    return (

        <Container className="space-y-10 sm:space-y-12 px-4  py-5 lg:py-30 ">

            {/* Heading */}
            <div className="flex flex-col items-center justify-center space-y-3 sm:space-y-4 text-center">

                <h2 className="text-2xl sm:text-[2.5rem] font-semibold text-blackColor leading-[130%] capitalize">
                    how out platform works
                </h2>

                <p className="text-sm sm:text-base font-normal text-descriptionColor leading-[160%] max-w-full sm:max-w-[700px]">
                    We’ve built our platform to simplify the entire process from start to finish. Find the right services, communicate effortlessly, and manage everything
                </p>

            </div>

            {/* Content */}
            <div className="flex flex-col lg:flex-row gap-8 lg:gap-25 items-center">

                {/* Image */}
                <div className="w-full lg:w-1/2">
                    <div className="bg-bgColorOne pt-4 lg:pt-[2.563rem] px-4 lg:px-[2.563rem]  rounded-2xl border
                     border-[#E7E0FF] flex justify-center items-center">
                        <Image
                            src="/platform.png"
                            alt="platform"
                            width={468}
                            height={500}
                            className="h-auto"
                        />
                    </div>
                </div>

                {/* Cards */}
                <div className="w-full lg:w-1/2 flex flex-col gap-2 sm:gap-4">
                    {platformData.map((item, index) => (
                        <PlatformCard key={index} items={item} isFirst={index === 0} />
                    ))}
                </div>

            </div>

        </Container>

    )
}

export default PlatformWork