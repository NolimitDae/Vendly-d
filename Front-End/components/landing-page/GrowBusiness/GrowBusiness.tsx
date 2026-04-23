import Container from '@/app/_components/Container'
import CustomButton from '@/components/reusable/CustomButton'
import CircleTickIcon from '@/icons/CircleTickIcon'
import Image from 'next/image'
import React from 'react'

const growBusinessData = [
    {
        icon: <CircleTickIcon color='#795FF4' />,
        title: "Create a professional service profile",


    },
    {
        icon: <CircleTickIcon color='#795FF4' />,
        title: "Accept or decline booking requests",

    },
    {
        icon: <CircleTickIcon color='#795FF4' />,
        title: "Set pricing, availability & milestones",

    },
    {
        icon: <CircleTickIcon color='#795FF4' />,
        title: "Get paid securely and on time",

    },
    {
        icon: <CircleTickIcon color='#795FF4' />,
        title: "Build your reputation with reviews",

    }
]

const GrowBusiness = () => {
    return (
        <Container className='flex flex-col lg:flex-row gap-8 lg:gap-25 items-center py-10 lg:py-30'>
            <div className='w-full lg:w-1/2'>
                <div className='space-y-7'>
                    <div className='space-y-4'>
                        <h2 className='text-2xl sm:text-[2.5rem] font-semibold text-blackColor leading-[130%] capitalize text-center md:text-left'>Grow Your Business with Thousands of Customers</h2>
                        <p className='text-sm sm:text-base font-normal text-descriptionColor leading-[160%] max-w-full sm:max-w-[700px] text-center md:text-left'>Take your business to the next level by reaching thousands of potential customers eager for your products and services. With the right platform and strategies, you can expand your audience, increase engagement, and grow</p>
                    </div>

                    <div className='space-y-3'>
                        {growBusinessData.map((item, index) => (
                            <div key={index} className='flex items-center gap-2'>
                                {item.icon}
                                <p className='text-[#1D1F2C] text-sm sm:text-base  font-normal  leading-[160%] '>{item.title}</p>
                            </div>
                        ))}
                    </div>
                </div>



                <div className='flex justify-center md:justify-start'>   <CustomButton className='gradient-bg px-9 py-3.5 text-white  font-medium text-lg rounded-full mt-9'>
                    Register Now
                </CustomButton></div>
            </div>
            <div className="w-full lg:w-1/2">
                <div className="bg-bgColorOne pt-4 lg:pt-[2.563rem] px-4 lg:px-[2.563rem]   rounded-2xl border
                                 border-[#E7E0FF] flex justify-center items-center">
                    <Image
                        src="/growBusiness.png"
                        alt="platform"
                        width={468}
                        height={500}
                        className="h-auto"
                    />
                </div>
            </div>
        </Container>
    )
}

export default GrowBusiness