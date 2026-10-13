import CustomButton from '@/components/reusable/CustomButton'
import AppleIcon from '@/icons/AppleIcon'
import React from 'react'

const AppleButton = () => {
    return (
        <CustomButton className="gradient-bg px-6 py-2.5 rounded-full gap-2.5">
            <AppleIcon />
            <div className='flex flex-col items-start whitespace-nowrap'>
                <p className='text-xs leading-[160%] text-white'>Download on the</p>
                <p className='text-lg font-semibold leading-[130%] text-white'>App Store</p>
            </div>
        </CustomButton>
    )
}

export default AppleButton
