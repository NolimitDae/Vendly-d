import React from 'react'

const ChevronRight = ({ className, stroke = 'white' }: { className?: string, stroke?: string }) => {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="9" height="22" viewBox="0 0 9 22" fill="none" stroke="currentColor" className={className}>
            <path d="M0.75 0.75C0.75 0.75 8.25 8.115 8.25 10.75C8.25 13.3852 0.75 20.75 0.75 20.75" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

export default ChevronRight