import React from 'react'

const SidebarIcon = ({ onclick }: { onclick: () => void }) => {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" onClick={onclick}>
            <path d="M3 6H17" stroke="#4A4C56" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 12H13" stroke="#4A4C56" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 18H17" stroke="#4A4C56" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 8L19.8462 8.87652C17.9487 10.318 17 11.0388 17 12C17 12.9612 17.9487 13.682 19.8462 15.1235L21 16" stroke="#4A4C56" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

export default SidebarIcon