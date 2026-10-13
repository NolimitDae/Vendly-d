import Container from '@/app/_components/Container';
import Image from 'next/image';
import AppleButton from '../buttons/AppleButton';
import PlaystoreButton from '../buttons/PlaystoreButton';

// Positions are percentages of the 950px square composition in the Figma hero (App Landing Page V2).
const rings = ['inset-0', 'inset-[13.16%]', 'inset-[26.32%]'];
const dots = [
    'left-[92.63%] top-[24.74%]', 'left-[85.79%] top-[48.95%]', 'left-[69.47%] top-[94.95%]', 'left-[4%] top-[70.63%]',
    'left-[17.05%] top-[10.53%]', 'left-[12.11%] top-[48.95%]', 'left-[30%] top-[62.95%]', 'left-[70.21%] top-[38.74%]',
];
const glassCard = 'absolute hidden md:flex flex-col p-5 rounded-2xl border-[0.5px] border-[rgba(205,193,255,0.2)] bg-[rgba(205,193,255,0.1)] backdrop-blur-[6px] text-white';

const HeroSection = () => {
    return (
        <Container>
            <div className='flex max-w-xl mx-auto justify-center items-center gap-[.813rem] mt-5 sm:mt-15 mb-1.5'>
                <p className='text-sm leading-[160%] text-center text-white'>All in one app</p>
                <div className='w-[90px] h-[0.5px] gradient-bg' />
            </div>
            <h1 className='text-[2rem] sm:text-[4rem] leading-[130%] font-semibold mb-4 text-center max-w-[630px] mx-auto text-white'>One App for All Your Everyday Needs</h1>
            <p className='text-base leading-[160%] text-center max-w-[630px] mx-auto text-white'>Discover, book, and manage trusted vendors across beauty, creative, event, and rental services — all from a single platform</p>

            <div className='flex items-center justify-center flex-col sm:flex-row gap-4 relative z-10 mt-10'>
                <AppleButton />
                <PlaystoreButton />
            </div>

            {/* The design crops the 950px composition 809px down; clip-path crops only the bottom so side cards can overhang. */}
            <div className='relative mx-auto w-full max-w-[950px] aspect-[950/809] mt-4 md:-mt-16 [clip-path:inset(0_-100vw)]'>
                <div className='absolute inset-x-0 top-0 aspect-square'>
                    {rings.map((inset) => (
                        <div key={inset} className={`absolute ${inset} rounded-full border-[0.5px] border-[#3A3A3F]`} />
                    ))}
                    {dots.map((pos) => (
                        <div key={pos} className={`absolute ${pos} size-[2.1%] rounded-full bg-[rgba(205,193,255,0.1)] backdrop-blur-[2px]`} />
                    ))}

                    <Image
                        src='/landing/hero-phone.png'
                        alt='Vendly app home screen'
                        width={424}
                        height={709}
                        priority
                        className='absolute left-[27.68%] top-[15.68%] w-[44.63%] h-auto'
                    />

                    <div className={`${glassCard} left-[1.26%] top-[15.68%] w-[206px]`}>
                        <p className='text-xl font-medium'>The Future of Automating Your Needs</p>
                    </div>

                    <div className={`${glassCard} left-[83.79%] top-[29.16%] gap-5`}>
                        <p className='text-xl font-medium whitespace-nowrap'>Our Profit Growth</p>
                        <p className='text-[4rem] font-semibold leading-none'>91%</p>
                    </div>

                    <div className={`${glassCard} -left-[2.32%] top-[52.84%] gap-3`}>
                        <div className='flex items-center gap-3'>
                            <p className='text-xl font-medium'>Rating</p>
                            <div className='flex items-center gap-2' aria-label='5 out of 5 stars'>
                                {[0, 1, 2, 3, 4].map((i) => (
                                    <Image key={i} src='/landing/star.svg' alt='' width={20} height={20} />
                                ))}
                            </div>
                        </div>
                        <p className='text-base leading-[160%] whitespace-nowrap'>Trusted Globally by Our Customer</p>
                        <div className='flex items-center'>
                            {[1, 2, 3].map((i) => (
                                <Image key={i} src={`/landing/hero-avatar-${i}.png`} alt='' width={36} height={36} className='-mr-4 rounded-full' />
                            ))}
                            <span className='size-9 rounded-full gradient-bg border-[0.5px] border-[#24213C] flex items-center justify-center text-[10px] leading-[160%]'>17k+</span>
                        </div>
                    </div>
                </div>
            </div>
        </Container>
    )
}

export default HeroSection;
