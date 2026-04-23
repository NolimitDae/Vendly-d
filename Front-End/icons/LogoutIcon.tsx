import React from 'react'

const LogoutIcon = ({color = "#4A4C56"}: {color?: string}) => {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M11.625 6.03034C11.5941 5.15979 11.4912 4.61588 11.1484 4.19003C10.6586 3.58152 9.8208 3.39048 8.14538 3.00841L7.39436 2.83714C4.84868 2.25661 3.57583 1.96635 2.72541 2.63488C1.875 3.3034 1.875 4.59427 1.875 7.17602V10.824C1.875 13.4057 1.875 14.6966 2.72541 15.3651C3.57583 16.0336 4.84868 15.7434 7.39436 15.1628L8.14538 14.9916C9.8208 14.6095 10.6586 14.4184 11.1484 13.81C11.4912 13.3841 11.5941 12.8402 11.625 11.9696" stroke={color} strokeWidth="1.125" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13.875 6.75879C13.875 6.75879 16.125 8.4159 16.125 9.00877C16.125 9.60172 13.875 11.2588 13.875 11.2588M15.75 9.00877H6.375" stroke={color} strokeWidth="1.125" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

export default LogoutIcon