import { useEffect } from "react"

// Orange palette (warm) - using hex to avoid oklch hue interpolation issues
const ORANGE = {
  primary: "#f59e0b",
  primaryEnd: "#ea580c",
  primaryMuted: "#f59e0bbf", // 75% opacity
}

// Pink palette (cool)
const PINK = {
  primary: "#ec4899",
  primaryEnd: "#a855f7",
  primaryMuted: "#ec4899bf", // 75% opacity
}

const CYCLE_INTERVAL_MS = 10000

export function useColorAnimation() {
  useEffect(() => {
    const root = document.documentElement

    // Set initial colors
    root.style.setProperty("--primary-animated", ORANGE.primary)
    root.style.setProperty("--primary-animated-end", ORANGE.primaryEnd)
    root.style.setProperty("--primary-animated-muted", ORANGE.primaryMuted)

    let isPink = false

    const interval = setInterval(() => {
      const colors = isPink ? ORANGE : PINK
      root.style.setProperty("--primary-animated", colors.primary)
      root.style.setProperty("--primary-animated-end", colors.primaryEnd)
      root.style.setProperty("--primary-animated-muted", colors.primaryMuted)
      isPink = !isPink
    }, CYCLE_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [])
}
