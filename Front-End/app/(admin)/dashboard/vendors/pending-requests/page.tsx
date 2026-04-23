import PendingRequestCard from '@/components/Dashboard/pending-request/PendingRequestCard'
import { pendingRequestData } from '@/data/pending-request'
import FailedIcon from '@/icons/FailedIcon'
import React from 'react'

const PendingRequest = () => {
  return (
    <div>
      <div className='flex items-start gap-2.5 bg-[#F6F3FF] p-3 rounded-xl'>
        <div className='mt-1'>
          <FailedIcon className='text-purpleOne' />
        </div>
        <div>
          <h2 className='text-grayColor2 leading-[160%] text-sm font-medium'>Subscription Terms</h2>
          <p className='text-grayColor1 leading-[160%] text-xs font-normal'>Once approved, subscription terms cannot be edited. Please review all documents carefully.</p>
        </div>

      </div>

      <div className='mt-5 grid grid-cols-1 md:grid-cols-2 gap-5'>
        {pendingRequestData.map((item) => (
          <PendingRequestCard key={item.id} data={item} />
        ))}
      </div>
    </div>
  )
}

export default PendingRequest