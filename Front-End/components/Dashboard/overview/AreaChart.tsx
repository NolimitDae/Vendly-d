import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { RechartsDevtools } from '@recharts/devtools';
import { CustomTooltip } from './CustomTollTip';

// #region Sample data
const data = [
    {
        name: 'Jan',
        uv: 2000,
        pv: 2400,
        amt: 2400,
    },
    {
        name: 'Feb',
        uv: 3000,
        pv: 1398,
        amt: 2210,
    },
    {
        name: 'Mar',
        uv: 2000,
        pv: 9800,
        amt: 2290,
    },
    {
        name: 'Apr',
        uv: 2780,
        pv: 3908,
        amt: 2000,
    },
    {
        name: 'May',
        uv: 1890,
        pv: 4800,
        amt: 2181,
    },
    {
        name: 'Jun',
        uv: 2390,
        pv: 3800,
        amt: 2500,
    },
    {
        name: 'Jul',
        uv: 3000,
        pv: 4300,
        amt: 2100,
    },
    {
        name: 'Aug',
        uv: 3890,
        pv: 4300,
        amt: 2100,
    },
    {
        name: 'Sep',
        uv: 3490,
        pv: 4300,
        amt: 2100,
    },
    {
        name: 'Oct',
        uv: 410,
        pv: 4300,
        amt: 2100,
    },
    {
        name: 'Nov',
        uv: 3490,
        pv: 4300,
        amt: 2100,
    },
    {
        name: 'Dec',
        uv: 490,
        pv: 4300,
        amt: 2100,
    },
];

// #endregion
const SimpleAreaChart = () => {
    return (
        <div className='w-full h-[350px]'>
            <ResponsiveContainer width="100%" height={"100%"}>
                <AreaChart
                    data={data}
                    margin={{
                        top: 20,
                        right: 0,
                        left: 0,
                        bottom: 0,
                    }}
                    onContextMenu={(_, e) => e.preventDefault()} height={200}
                >

                    <defs>
                        <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#795FF4" stopOpacity={0.9} />
                            <stop offset="50%" stopColor="#795FF4" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#795FF4" stopOpacity={0} />
                        </linearGradient>
                    </defs>


                    <CartesianGrid strokeDasharray="3 3" vertical={false} />


                    <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                    />

                    <YAxis
                        width="auto"
                        ticks={[0, 2000, 4000, 6000, 8000, 10000, 12000]}
                        tickFormatter={(value) => `$${value}`}
                        axisLine={false}
                        tickLine={false}
                    />

                    <Tooltip content={<CustomTooltip />} />


                    <Area
                        type="monotone"
                        dataKey="uv"
                        stroke="#795FF4"
                        fill="url(#colorUv)"
                    />

                    <RechartsDevtools />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

export default SimpleAreaChart;