import CustomButton from '@/components/reusable/CustomButton'
import PlayStoreIcon from '@/icons/PlayStoreIcon'
import React from 'react'

const PlaystoreButton = () => {
    return (
        <CustomButton className='px-6 py-2.5 rounded-full gap-2.5 bg-grayBg border-[0.5px] border-borderColor'>
            <PlayStoreIcon />
            <div className='flex flex-col items-start whitespace-nowrap'>
                <p className='text-xs leading-[160%] text-blackColor'>Get it on</p>
                <p className='text-lg font-semibold leading-[130%] text-blackColor'>Play Store</p>
            </div>
        </CustomButton>
    )
}

export default PlaystoreButton
