'use client'

import { cn } from '@/lib/utils'
import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

interface SiteLogoProps {
    gapKey?: keyof typeof gapClasses;
    imageSizeKey?: keyof typeof imageSizeClasses;
    fontSizeKey?: keyof typeof fontSizeClasses;
    textColorKey?: keyof typeof textColorClasses;
}

const gapClasses = {
    gapOne: "gap-2.5",
    gapTwo: "gap-3",
}

const fontSizeClasses = {
    fontSizeOne: "text-lg",
    fontSizeTwo: "text-xl",
    fontSizeThree: "text-2xl",
}

const textColorClasses = {
    purple: "bg-gradient-to-r from-purpleOne via-purpleTwo to-purpleThree bg-clip-text text-transparent",
    white: "text-white",
    black: "text-blackColor",
}

const imageSizeClasses = {
    imageOne: "w-[2.25rem] h-[2.25rem]",
    imageTwo: "w-[2.5rem] h-[2.5rem]",
    imageThree: "w-[3.125rem] h-[3.125rem]",
}

const SiteLogo = ({
    gapKey,
    imageSizeKey,
    fontSizeKey,
    textColorKey
}: SiteLogoProps) => {
    return (
        <Link href="/" className={cn("flex items-center", gapClasses[gapKey])}>
            <Image
                src="/site_logo.png"
                alt="logo"
                width={40}
                height={40}
                className={imageSizeClasses[imageSizeKey]}
            />

            <span
                className={cn(
                    "font-bold",
                    textColorClasses[textColorKey],
                    fontSizeClasses[fontSizeKey]
                )}
            >
                Vendly
            </span>
        </Link>
    );
};

export default SiteLogo