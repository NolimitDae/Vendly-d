import Image from 'next/image'
import React from 'react'


export default function CustomImage({
  src = "",
  alt = "",
  width = 100,
  height = 100,
  loading = "lazy",
  layout = "responsive",
  ...props
}) {
  const shimmer = (w, h) => `
<svg width="${w}" height="${h}" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="g">
      <stop stopColor="#dddddd" offset="20%" />
      <stop stopColor="#b1b1b1" offset="50%" />
      <stop stopColor="#dddddd" offset="70%" />
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="#dddddd" />
  <rect id="r" width="${w}" height="${h}" fill="url(#g)" />
  <animate xlink:href="#r" attributeName="x" from="-${w}" to="${w}" dur="1s" repeatCount="indefinite"  />
</svg>`

  const toBase64 = (str) =>
    typeof window === 'undefined'
      ? Buffer.from(str).toString('base64')
      : window.btoa(str)
  return (
    <Image
      crossOrigin="anonymous"
      src={src} alt={alt}
      loading="lazy"
      width={width}
      height={height}
      unoptimized={false}
      layout={layout}
      placeholder="blur"
      blurDataURL={`data:image/svg+xml;base64,${toBase64(shimmer(width, height))}`}
      loader={() => src}
      {...props}
    />
  )
}


// const shimmer = (w, h) => `
// <svg width="${w}" height="${h}" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
//   <defs>
//     <linearGradient id="g">
//       <stop stopColor="#333" offset="20%" />
//       <stop stopColor="#222" offset="50%" />
//       <stop stopColor="#333" offset="70%" />
//     </linearGradient>
//   </defs>
//   <rect width="${w}" height="${h}" fill="#333" />
//   <rect id="r" width="${w}" height="${h}" fill="url(#g)" />
//   <animate xlink:href="#r" attributeName="x" from="-${w}" to="${w}" dur="1s" repeatCount="indefinite"  />
// </svg>`