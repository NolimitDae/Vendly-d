import React from 'react'

const FailedIcon = ({ className }: { className?: string }) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke='currentColor' className={className}>
      <path d="M10.0003 18.3334C14.6027 18.3334 18.3337 14.6025 18.3337 10.0001C18.3337 5.39771 14.6027 1.66675 10.0003 1.66675C5.39795 1.66675 1.66699 5.39771 1.66699 10.0001C1.66699 14.6025 5.39795 18.3334 10.0003 18.3334Z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 6.66675V10.4167" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 13.3235V13.3318" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default FailedIcon