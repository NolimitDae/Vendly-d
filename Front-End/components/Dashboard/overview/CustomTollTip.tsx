export const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: any; label?: string }) => {
    if (active && payload?.length) {
        return (
            <div className="bg-white rounded-xl p-2 text-blackColor text-sm font-sans divide-y divide-borderColor">
                <div className="font-medium text-sm pb-2">{label} 2026</div>
                <div className='flex items-center gap-[0.342rem] pt-2'>
                    <div className="h-[10px] w-[3px] rounded-lg bg-purpleOne" />
                    <div className="text-sm opacity-90">
                        Revenue : ${payload[0]?.value.toLocaleString()}
                    </div>
                </div>
            </div>
        );
    }
    return null;
};