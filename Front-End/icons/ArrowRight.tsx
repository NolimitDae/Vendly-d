import React from 'react'

const ArrowRight = ({ color = "#4A4C56" }: { color?: string }) => {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22" fill="none" stroke='currentColor'>
            <path d="M18.3336 11H3.66699" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13.7501 15.5837C13.7501 15.5837 18.3333 12.2081 18.3333 11.0003C18.3333 9.79253 13.75 6.41699 13.75 6.41699" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

export default ArrowRight