import Link from 'next/link'
import Logo from './Logo'

interface SiteLogoProps {
    imageSizeKey?: keyof typeof markSizes;
    textColorKey?: 'purple' | 'white' | 'black';
    // Kept so existing call sites compile; spacing and type size now come from the logo itself.
    gapKey?: string;
    fontSizeKey?: string;
}

const markSizes = {
    imageOne: 36,
    imageTwo: 40,
    imageThree: 50,
}

const SiteLogo = ({ imageSizeKey = 'imageTwo', textColorKey }: SiteLogoProps) => (
    <Link href="/" className="flex items-center">
        <Logo variant="horizontal" tone={textColorKey === 'white' ? 'dark' : 'light'} size={markSizes[imageSizeKey]} />
    </Link>
)

export default SiteLogo
