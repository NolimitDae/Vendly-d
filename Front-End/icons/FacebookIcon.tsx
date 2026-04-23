import React from 'react'

const FacebookIcon = ({ className, color = "#FAFAFA" }: { className?: string, color?: string }) => {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="8" height="16" viewBox="0 0 8 16" fill="none" className={className}>
            <path d="M5.18233 15.3949V8.37306H7.53516L7.88815 5.63572H5.18233V3.88833C5.18233 3.09606 5.40114 2.55614 6.53703 2.55614L7.98339 2.55554V0.107171C7.73326 0.074623 6.87466 0 5.87534 0C3.78859 0 2.35996 1.27544 2.35996 3.61723V5.63572H0V8.37306H2.35996V15.3949H5.18233Z" fill="currentColor" />
        </svg>
    )
}

export default FacebookIcon