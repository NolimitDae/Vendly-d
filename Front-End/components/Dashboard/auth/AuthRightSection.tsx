'use client'

import React, { useEffect, useState } from 'react'
import { BadgeDollarSign, CheckCircle2, ShieldCheck, Users } from 'lucide-react'
import SiteLogo from '@/components/brand/SiteLogo'
import PhoneFrame from '@/components/landing/phone/PhoneFrame'
import HomeScreen from '@/components/landing/phone/screens/HomeScreen'
import ConfirmedScreen from '@/components/landing/phone/screens/ConfirmedScreen'
import CheckoutScreen from '@/components/landing/phone/screens/CheckoutScreen'
import ProofScreen from '@/components/landing/phone/screens/ProofScreen'
import VendorDashboardScreen from '@/components/landing/phone/screens/VendorDashboardScreen'
import PaidScreen from '@/components/landing/phone/screens/PaidScreen'
import PlannerEventScreen from '@/components/landing/phone/screens/PlannerEventScreen'
import RequestScreen from '@/components/landing/phone/screens/RequestScreen'

interface Slide {
  title: string
  body: string
  chip: { icon: React.ReactNode; label: string }
  /** the phone at the back (right) and the one in front (left), with what each shows for screen readers */
  back: { screen: React.ReactNode; label: string }
  front: { screen: React.ReactNode; label: string }
}

const SLIDES: Slide[] = [
  {
    title: 'Welcome to Vendly',
    body: 'Find and book trusted event vendors: DJs, photographers, caterers, decor, rentals and more, all in one place.',
    chip: { icon: <CheckCircle2 className="size-3.5" />, label: 'Booking confirmed' },
    back: { screen: <ConfirmedScreen />, label: 'A confirmed booking in the Vendly app' },
    front: { screen: <HomeScreen />, label: 'Browsing vendors in the Vendly app' },
  },
  {
    title: 'Your money is protected',
    body: 'Pay in full or with a deposit. Vendly holds your payment until the job is done, and every booking comes with a signed contract.',
    chip: { icon: <ShieldCheck className="size-3.5" />, label: 'Payment held' },
    back: { screen: <ProofScreen />, label: "A vendor's photo proof of the work" },
    front: { screen: <CheckoutScreen />, label: 'Paying for a booking in the Vendly app' },
  },
  {
    title: 'Get booked, get paid',
    body: 'Vendors list for free, send custom quotes and get paid straight to their bank, or cash out instantly.',
    chip: { icon: <BadgeDollarSign className="size-3.5" />, label: 'Paid out' },
    back: { screen: <PaidScreen />, label: 'A payout to a vendor' },
    front: { screen: <VendorDashboardScreen />, label: 'The Vendly vendor dashboard' },
  },
  {
    title: 'Plan whole events',
    body: 'Planners book a full team of vendors, share files and keep every contract and payment in one place.',
    chip: { icon: <Users className="size-3.5" />, label: 'Team booked' },
    back: { screen: <RequestScreen />, label: 'A booking request in the Vendly app' },
    front: { screen: <PlannerEventScreen />, label: "A planner's event in the Vendly app" },
  },
]

const EVERY_MS = 6000

/**
 * The panel beside the sign-in forms: a few slides about Vendly that change every few seconds (not
 * while the pointer is over the panel, and not at all for people who ask for reduced motion). The
 * dashes show which slide is on and jump to one when clicked.
 */
const AuthRightSection = () => {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), EVERY_MS)
    return () => clearInterval(t)
  }, [paused])

  return (
    <div
      className="hidden lg:flex lg:w-1/2 bg-linear-to-br from-plum-950 via-plum-900 to-plum-500 items-center justify-center pl-20 pt-20 rounded-2xl overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="About Vendly"
    >
      <div className="w-full">
        <div className="mb-10">
          <SiteLogo gapKey="gapTwo" imageSizeKey="imageTwo" fontSizeKey="fontSizeOne" textColorKey="white" />
        </div>

        {/* the slide's words, kept clear of the panel's right edge */}
        <div className="grid mb-8 max-w-md pr-10">
          {SLIDES.map((s, i) => (
            <div
              key={s.title}
              className={`[grid-area:1/1] space-y-2 transition-opacity duration-500 ${i === index ? 'opacity-100' : 'opacity-0 [pointer-events:none]'}`}
              aria-hidden={i !== index}
            >
              <h2 className="text-[2rem] leading-[130%] text-white">{s.title}</h2>
              <p className="text-white/75 text-sm leading-[160%]">{s.body}</p>
            </div>
          ))}
        </div>

        {/* which slide is on; click one to go to it */}
        <div className="flex gap-2 mb-[5.188rem]" role="tablist" aria-label="Slides">
          {SLIDES.map((s, i) => (
            <button
              key={s.title}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Slide ${i + 1}: ${s.title}`}
              onClick={() => setIndex(i)}
              className={`h-1 rounded-lg transition-all duration-300 ${i === index ? 'w-[1.5rem] bg-white' : 'w-[0.75rem] bg-white/35 hover:bg-white/60'}`}
            />
          ))}
        </div>

        {/* App screens drawn in code (as on the landing page), cropped by the panel's bottom edge */}
        <div className="relative h-[360px]">
          {SLIDES.map((s, i) => (
            <div
              key={s.title}
              className={`absolute inset-0 transition-opacity duration-500 ${i === index ? 'opacity-100' : 'opacity-0 [pointer-events:none]'}`}
              aria-hidden={i !== index}
            >
              <div className="absolute left-[290px] top-0 rotate-6">
                <PhoneFrame width={230} label={s.back.label}>
                  {s.back.screen}
                </PhoneFrame>
              </div>
              <div className="absolute left-0 top-8 -rotate-3">
                <PhoneFrame width={250} label={s.front.label}>
                  {s.front.screen}
                </PhoneFrame>
              </div>
              <div className="absolute left-[160px] -top-16 z-10 flex items-center gap-2 rounded-2xl border border-white/15 bg-plum-900/95 px-4 py-3 text-sm font-semibold text-white shadow-[0_20px_40px_-12px_rgba(0,0,0,0.6)]">
                <span className="grid size-7 place-items-center rounded-full bg-brand">{s.chip.icon}</span>
                {s.chip.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default AuthRightSection
