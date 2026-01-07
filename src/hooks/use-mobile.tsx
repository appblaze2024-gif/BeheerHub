"use client"

import * as React from "react"

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined
  )

  React.useEffect(() => {
    const checkDevice = () => {
      setIsMobile(window.innerWidth < breakpoint)
    }

    checkDevice()
    window.addEventListener("resize", checkDevice)

    return () => {
      window.removeEventListener("resize", checkDevice)
    }
  }, [breakpoint])

  return isMobile
}
