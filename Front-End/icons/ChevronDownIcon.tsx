import React from 'react'

const ChevronDownIcon = ({ purple = false }: { purple?: boolean }) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="7" viewBox="0 0 13 7" fill="none">
      <path d="M11.75 0.750042C11.75 0.750042 7.69931 6.24999 6.24996 6.25C4.8006 6.25001 0.75 0.749999 0.75 0.749999"
        stroke={purple ? "#8A2BE2" : "#4A4C56"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round" />
    </svg>
  )
}

export default ChevronDownIcon