import React from 'react'
import Container from '@/app/_components/Container'
import CircleTickIcon from '@/icons/CircleTickIcon'
import ArrowRight from '@/icons/ArrowRight'
import ServiceOverviewCard from './ServiceOverviewCard'

const serviceOverviewData = [
    {
        id: 1,
        image: "/serviceOne.png",
        title: "Beauty & personal care",
        features: [
            { icon: <CircleTickIcon />, desc: "Bridal & party makeup" },
            { icon: <CircleTickIcon />, desc: "Hair styling & treatments" },
            { icon: <CircleTickIcon />, desc: "Skincare & facials" },

        ],
        link: {
            label: "Explore More",
            href: "#",
            icon: <ArrowRight color='#795FF4' />
        }
    },
    {
        id: 2,
        image: "/serviceTwo.png",
        title: "Creative & Media",
        features: [
            { icon: <CircleTickIcon />, desc: "Photography & videography" },
            { icon: <CircleTickIcon />, desc: "Graphic design & branding" },
            { icon: <CircleTickIcon />, desc: "Content writing & editing" },

        ],
        link: {
            label: "Explore More",
            href: "#",
            icon: <ArrowRight />
        }
    },
    {
        id: 3,
        image: "/serviceThree.png",
        title: "Event Service",
        features: [
            { icon: <CircleTickIcon />, desc: "Event planners & coordinators" },
            { icon: <CircleTickIcon />, desc: "Venue & vendor management" },
            { icon: <CircleTickIcon />, desc: "Decorations & styling" },

        ],
        link: {
            label: "Explore More",
            href: "#",
            icon: <ArrowRight />
        }
    },
    {
        id: 4,
        image: "/serviceFour.png",
        title: "Rentals",
        features: [
            { icon: <CircleTickIcon />, desc: "Furniture & decor rentals" },
            { icon: <CircleTickIcon />, desc: "Equipment & supply rentals" },
            { icon: <CircleTickIcon />, desc: "Delivery & setup services" },

        ],
        link: {
            label: "Explore More",
            href: "#",
            icon: <ArrowRight />
        }
    }
]

const ServiceOverview = () => {
    return (

        <Container className='py-10 lg:py-30 space-y-12'>
            <div className='flex flex-col items-center justify-center gap-4'>
                <h2 className='text-2xl sm:text-[2.5rem] font-semibold capitalize leading-[130%] text-center'>Our Core Services overview</h2>
                <p className='text-sm sm:text-lg leading-[160%] max-w-[600px] mx-auto text-center text-descriptionColor'>Our core services are designed to deliver seamless, high-quality solutions tailored to your needs. Ensure exceptional results at every stage</p>
            </div>

            <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-7.5'>
                {serviceOverviewData.map((service, index) => (
                    <ServiceOverviewCard key={service.id} {...service} isActive={index === 0} />
                ))}
            </div>
        </Container>

    )
}

export default ServiceOverview