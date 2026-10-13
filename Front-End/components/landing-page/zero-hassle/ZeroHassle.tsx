import Container from '@/app/_components/Container'
import React from 'react'
import AppleButton from '../buttons/AppleButton'
import PlaystoreButton from '../buttons/PlaystoreButton'
import Image from 'next/image'

const ZeroHassle = () => {
    return (
        <Container className='pt-10 lg:pt-30'>
            <div className='flex flex-col lg:flex-row justify-between gap-8 items-center bg-white rounded-2xl overflow-hidden lg:h-[430px]'>
                <div className='w-full lg:w-[536px] shrink-0 space-y-6 sm:space-y-9 p-6 lg:p-0 lg:ml-[50px]'>
                    <div className='space-y-4'>
                        <h2 className='text-2xl sm:text-[2.5rem] font-semibold text-blackColor leading-[130%] capitalize text-center lg:text-left'>One Platform, Unlimited Services, and Zero Hassle</h2>
                        <p className='text-sm sm:text-base font-normal text-descriptionColor leading-[160%] text-center lg:text-left'>One powerful platform that brings together endless services, designed to simplify your experience & eliminate every unnecessary step</p>
                    </div>
                    <div className='flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4'>
                        <AppleButton /><PlaystoreButton />
                    </div>
                </div>

                {/* Figma crops zeroHassle.png into a 483x586 frame that the 430px card cuts off at the bottom. */}
                <div className='relative w-full max-w-[483px] aspect-[483/586] self-center lg:self-start lg:mt-[50px] lg:mr-10 shrink-0 overflow-hidden'>
                    <Image
                        src='/zeroHassle.png'
                        alt='Vendly booking and payment screens'
                        width={1500}
                        height={1125}
                        className='absolute max-w-none w-[189.63%] h-[117.31%] left-[-49.94%] top-[-8.97%]'
                    />
                </div>
            </div>
        </Container>
    )
}

export default ZeroHassle
