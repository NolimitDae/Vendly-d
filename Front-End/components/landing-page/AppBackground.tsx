'use client'

import { useTheme } from '@/hooks/useTheme';
import React from 'react'

const AppBackground = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className={`w-full hero_wrapper -mt-[112px] pt-[112px] pb-12`}>
            {children}
        </div>
    )
}

export default AppBackground