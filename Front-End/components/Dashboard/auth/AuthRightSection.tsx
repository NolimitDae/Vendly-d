import SiteLogo from '@/components/landing-page/SiteLogo'
import Image from 'next/image'
import React from 'react'

const AuthRightSection = () => {
  return (
    <div className="hidden lg:flex lg:w-1/2 gradient-bg items-center justify-center pl-20 pt-20 rounded-2xl">
      <div className="">

        <div className="mb-10">
          <SiteLogo
            gapKey="gapTwo"
            imageSizeKey="imageTwo"
            fontSizeKey="fontSizeOne"
            textColorKey="white"
          />

        </div>

        <div className="space-y-2 mb-8">
          <h2 className="text-[2rem] leading-[130%] text-white">Welcome to Vendly</h2>
          <p className="text-borderColor text-sm leading-[160%]">
            Vendly is an all-in-one platform designed to manage multiple
            businesses and services effortlessly. Customers can discover and
            book trusted vendors.
          </p>
        </div>

        {/* progress bars */}
        <div className="flex gap-2 mb-[5.188rem]">
          <div className="w-[1.5rem] h-1 bg-white rounded-lg" />
          <div className="w-[0.75rem] h-1 bg-progressBarBg rounded-lg" />
          <div className="w-[0.75rem] h-1 bg-progressBarBg rounded-lg" />
          <div className="w-[0.75rem] h-1 bg-progressBarBg rounded-lg" />
        </div>

        <div className="login_right_section_bg pl-[1.873rem] pt-[1.875rem]  border-2 ">
          <Image
            src={"/login_image.png"}
            width={400}
            height={400}
            alt="login image"
            className="w-full "
          />
        </div>
      </div>
    </div>
  )
}

export default AuthRightSection