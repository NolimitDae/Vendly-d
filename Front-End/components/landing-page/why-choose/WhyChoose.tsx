import MultiServiceIcon from '@/icons/MultiServiceIcon'
import SecurePayment from '@/icons/SecurePayment'
import VerifiedIcon from '@/icons/VerifiedIcon'
import React from 'react'
import WhyChooseCard from './WhyChooseCard'
import Container from '@/app/_components/Container'

const whyChooseData = [
    {
        icon: <MultiServiceIcon />,
        header: 'Multi-Service, OneApp',
        description: 'All your services, all in one place. Discover, book, and manage multiple services seamlessly with just one app'
    }, {
        icon: <VerifiedIcon />,
        header: 'Verified Vendors',
        description: 'Connect with vendors who are verified, reviewed, & highly rated by our community for reliable & quality services'
    },
    {
        icon: <SecurePayment />,
        header: 'Secure Payments',
        description: 'Safe Transactions & Legal Agreements. Ensure every payment is protected and every agreement is clear'
    }
]

const WhyChoose = () => {
    return (
        <Container className='py-10 lg:py-30 space-y-12'>
            <div>
                <h2 className='text-2xl sm:text-[2.5rem] font-semibold capitalize leading-[130%] text-center text-blackColor dark:text-white'>Why Choose Our Platform</h2>
                <p className='text-sm sm:text-lg leading-[160%] max-w-2xl mx-auto text-center text-descriptionColor dark:text-white'>Our platform is designed to make your experience simple, reliable, and efficient. We bring everything together in one place so you can manage</p>
            </div>

            <div className='grid grid-cols-1 xl:grid-cols-3 gap-7.5'>
                {whyChooseData.map((item, index) => (
                    <WhyChooseCard key={index} item={item} />
                ))}
            </div>
        </Container>
    )
}

export default WhyChoose 