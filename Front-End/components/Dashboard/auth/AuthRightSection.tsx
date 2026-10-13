import SiteLogo from '@/components/brand/SiteLogo'
import { ShieldCheck } from 'lucide-react'
import PhoneFrame from '@/components/landing/phone/PhoneFrame'
import VendorDashboardScreen from '@/components/landing/phone/screens/VendorDashboardScreen'
import ConfirmedScreen from '@/components/landing/phone/screens/ConfirmedScreen'
import React from 'react'

const AuthRightSection = () => {
  return (
    <div className="hidden lg:flex lg:w-1/2 bg-linear-to-br from-plum-950 via-plum-900 to-plum-500 items-center justify-center pl-20 pt-20 rounded-2xl overflow-hidden">
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

        {/* App screens drawn in code (same as the landing page), cropped by the panel's bottom edge */}
        <div className="relative h-[360px]">
          <div className="absolute left-40 top-0 rotate-6 opacity-90">
            <PhoneFrame width={230} label="A confirmed booking in the Vendly app">
              <ConfirmedScreen />
            </PhoneFrame>
          </div>
          <div className="absolute left-0 top-8 -rotate-3">
            <PhoneFrame width={250} label="The Vendly vendor dashboard">
              <VendorDashboardScreen />
            </PhoneFrame>
          </div>
          <div className="absolute left-52 top-24 flex items-center gap-2 rounded-2xl border border-white/15 bg-plum-900/95 px-4 py-3 text-sm font-semibold text-white shadow-[0_20px_40px_-12px_rgba(0,0,0,0.6)]">
            <span className="grid size-7 place-items-center rounded-full bg-brand">
              <ShieldCheck className="size-3.5" />
            </span>
            Payment held
          </div>
        </div>
      </div>
    </div>
  )
}

export default AuthRightSection