import Container from '@/app/_components/Container'
import CustomButton from '@/components/reusable/CustomButton'
import Image from 'next/image'
import React from 'react'

const ConnectPeople = () => {
    return (
        <Container className="flex flex-col md:flex-row items-center gap-10 md:gap-20 pt-5 md:pt-12.5 pb-10 lg:pb-30">

            {/* Left Content */}
            <div className="flex flex-col w-full md:w-1/2">

                <h2 className="text-blackColor text-2xl md:text-[2.5rem] leading-[130%] font-semibold capitalize mb-4 text-center md:text-left">
                    We’re Building a Smarter Way to connect people
                </h2>

                <p className="text-descriptionColor text-sm md:text-base leading-[160%] mb-6 md:mb-9 text-center md:text-left">
                    Our multi-business vendor app brings together Beauty & Personal Care, Creative & Media Services, Event Services, and Rentals under a single ecosystem. We make the entire process simple and transparent
                </p>

                <div className='w-full flex justify-center md:justify-start'>
                    <CustomButton className="gradient-bg px-6 md:px-9 py-3 rounded-full text-white mb-5 md:mb-15 text-base md:text-lg w-fit">
                        About Us
                    </CustomButton>
                </div>

                <div className="flex justify-between flex-wrap md:flex-nowrap gap-6">

                    <div className="flex flex-col space-y-1 w-full md:w-auto">
                        <div className="h-[0.5px] w-full bg-[#D2D2D5] mb-3" />
                        <strong className="text-blackColor text-xl md:text-[2.5rem] font-semibold">
                            17K+
                        </strong>
                        <span className="text-descriptionColor text-sm md:text-base">
                            Total Customers
                        </span>
                    </div>

                    <div className="flex flex-col space-y-1 w-full md:w-auto">
                        <div className="h-[0.5px] w-full bg-[#D2D2D5] mb-3" />
                        <strong className="text-blackColor text-xl md:text-[2.5rem] font-semibold">
                            12K+
                        </strong>
                        <span className="text-descriptionColor text-sm md:text-base">
                            Countries with active app users
                        </span>
                    </div>

                </div>
            </div>

            {/* Right Image */}
            <div className="w-full md:w-1/2 flex justify-center">
                <Image
                    src="/connectPeople.png"
                    alt="connectPeople"
                    width={500}
                    height={500}
                    className="w-full max-w-[400px] md:max-w-[500px] h-auto"
                />
            </div>

        </Container>
    )
}

export default ConnectPeople