"use client"

import Container from '@/app/_components/Container';
import Image from 'next/image';
import AppleButton from '../buttons/AppleButton';
import PlaystoreButton from '../buttons/PlaystoreButton';
import { useTheme } from '@/hooks/useTheme';

const HeroSection = () => {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    return (
        <Container>
            <div className='flex max-w-xl mx-auto  justify-center items-center gap-[.813rem]  mt-5 sm:mt-15  mb-1.5 '><p className={`text-sm leading-[160%] text-center text-descriptionColor dark:text-white`}>All in one app</p> <div className='w-[100px] h-[1px] bg-violet-500 ' /></div>
            <h1 className={`text-2xl sm:text-[4rem] leading-[130%] font-semibold mb-4 text-center max-w-2xl mx-auto text-blackColor dark:text-white`}>One App for All Your Everyday Needs</h1>
            <p className={`text-base sm:text-lg leading-[160%] text-center mb-1 sm:mb-10 max-w-2xl mx-auto text-descriptionColor dark:text-white`}>Discover, book, and manage trusted vendors across beauty, creative, event, and rental services — all from a single platform</p>

            <div className='flex items-center justify-center flex-col sm:flex-row sm:gap-4 gap-2 relative mt-4'>
                <AppleButton />
                <PlaystoreButton />
            </div>

            <div className='flex items-center justify-center -mt-20'>
                <Image className="dark:hidden" src="/vendly_overlay.png" alt="hero" width={950} height={100} />
                <Image className="hidden dark:block" src="/vendly_overlay_dark.png" alt="hero" width={950} height={100} />
            </div>

        </Container>
    )
}

export default HeroSection;