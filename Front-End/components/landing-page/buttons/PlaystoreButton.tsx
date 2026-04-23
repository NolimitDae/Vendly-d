import CustomButton from '@/components/reusable/CustomButton'
import PlayStoreIcon from '@/icons/PlayStoreIcon'
import React from 'react'

const PlaystoreButton = () => {
    return (
        <CustomButton className='px-6 py-2.5 rounded-full bg-white  border-[0.031rem] border-[#E9E9EA]'>
            <PlayStoreIcon />
            <div className='flex flex-col whitespace-nowrap'  >
                <p className='text-xs leading-[160%] text-blackColor'   >Get it on</p>
                <p>Google Play</p>
            </div>
        </CustomButton>
    )
}

export default PlaystoreButton