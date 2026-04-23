import React from 'react'

const PrivacyCard = ({title, description}: {title: string, description: string}) => {
  return (
    
        <div className="space-y-1">
          <h2 className="text-sm font-medium leading-[160%] text-blackColor">
            {title}
          </h2>
          <p className="text-sm font-normal leading-[160%] text-descriptionColor">
            {description}
          </p>
        </div>
  )
}

export default PrivacyCard