import React from 'react'

const Container = ({ children, className }: { children: React.ReactNode, className?: string }) => {
    return (
        <div className={`px-4 sm:px-[4.438rem] max-w-[1312px] mx-auto ${className}`}>{children}</div>
    )
}

export default Container

// const containerVariants = {
//   default: "px-4 sm:px-6 lg:px-8 py-12",
//   compact: "px-4 sm:px-6 lg:px-8 py-6",
// };

// const Container = ({ children, variant = "default" }) => {
//   return (
//     <div className={containerVariants[variant]}>
//       {children}
//     </div>
//   );
// };