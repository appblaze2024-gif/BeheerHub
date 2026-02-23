"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  variant?: "default" | "gauge";
}

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value, variant = "default", ...props }, ref) => {
  const colorValue = value || 0;
  
  let backgroundColor;

  if (variant === 'gauge') {
    if (colorValue < 25) backgroundColor = '#22c55e'; // Green
    else if (colorValue < 50) backgroundColor = '#eab308'; // Yellow
    else if (colorValue < 75) backgroundColor = '#f97316'; // Orange
    else backgroundColor = '#ef4444'; // Red
  } else {
    // Default to a green theme color for loading/default progress
    backgroundColor = 'hsl(var(--chart-2))';
  }

  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn(
        "relative h-4 w-full overflow-hidden rounded-full bg-secondary",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full w-full flex-1 transition-all"
        style={{ 
          transform: `translateX(-${100 - (value || 0)}%)`,
          backgroundColor: backgroundColor
        }}
      />
    </ProgressPrimitive.Root>
  )
})
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
