import React from 'react'
import Image from "next/image"
import Link from 'next/link'

interface ServiceOverviewCardProps {
    image: string;
    title: string;
    features: {
        icon: React.ReactNode;
        desc: string;
    }[];
    link: {
        label: string;
        href: string;
        icon: React.ReactNode;
    };
    isActive?: boolean;
}

const ServiceOverviewCard = ({ image, title, features, link, isActive }: ServiceOverviewCardProps) => {
    return (
        <div className='space-y-4 sm:space-y-6 '>
            <div className='w-full'>
                <Image src={image} alt={title} width={300} height={300} className='w-full h-full object-cover' />
            </div>

            <div>
                <h1 className='text-lg sm:text-2xl font-semibold capitalize leading-[130%] text-blackColor mb-4'>{title}</h1>
                <div className='space-y-3'>
                    {features.map((feature, index) => (
                        <div key={index} className='flex items-center gap-2'>
                            {feature.icon}
                            <p className='text-sm sm:text-base leading-[160%] text-descriptionColor'>{feature.desc}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <Link
                    href={link.href}
                    className={`flex items-center gap-2 text-base sm:text-lg transition-all duration-300 ${isActive
                            ? "bg-gradient-to-r from-purpleOne via-purpleTwo to-purpleThree bg-clip-text text-transparent"
                            : "text-descriptionColor hover:text-purpleTwo"
                        }`}
                >
                    <span className="flex items-center gap-2">
                        {link.label}

                        {/* Icon */}
                        <span className="fill-current stroke-current">
                            {link.icon}
                        </span>
                    </span>
                </Link>
            </div>
        </div>
    )
}

export default ServiceOverviewCard