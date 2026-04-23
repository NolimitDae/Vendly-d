import React from 'react'

const DashboardContainer = ({ children ,className}: { children: React.ReactNode; className?: string }) => {
  return (
    <div className={`p-5 ${className}`}>
      {children}
    </div>
  )
}

export default DashboardContainer