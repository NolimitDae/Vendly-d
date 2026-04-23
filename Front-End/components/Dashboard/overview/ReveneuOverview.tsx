import SelectInputField from '@/components/reusable/InputFiled/SelectInputField'
import React from 'react'
import SimpleAreaChart from './AreaChart'

const ReveneuOverview = () => {
    return (
       <div className='bg-grayBg p-4 rounded-xl space-y-5'>
         <div className='flex items-center justify-between '>
            <div className='space-y-1'>
                <h3 className='text-blackColor text-lg font-semibold leading-[160%]'>Revenue Overview</h3>
                <p className='text-descriptionColor leading-[160%]'>Monthly revenue analytics</p>
            </div>
            <div>
                <SelectInputField options={[{ label: "Monthly", value: "Monthly" }, { label: "Yearly", value: "Yearly" }]} placeholder=" Monthly" className='border-0 shadow-none text-blackColor font-xs'/>
            </div>
        </div>

        <SimpleAreaChart />
       </div>
    )
}

export default ReveneuOverview