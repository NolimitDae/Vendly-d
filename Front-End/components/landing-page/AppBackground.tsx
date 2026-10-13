import React from 'react'

const AppBackground = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className='relative w-full hero_bg_dark -mt-[112px] pt-[112px]'>
            {children}
            <div className='pointer-events-none absolute inset-x-0 bottom-0 h-[140px] bg-linear-to-b from-transparent to-darkBg' />
        </div>
    )
}

export default AppBackground
