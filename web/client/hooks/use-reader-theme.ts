import { useState, useEffect } from "react"
import type { ReaderTheme } from "../constants/themes"

export type { ReaderTheme }

export function useReaderTheme() {
  const [theme, setTheme] = useState<ReaderTheme>(() => {
    if (typeof window === "undefined") return "light"
    try {
      const saved = localStorage.getItem("reader-theme")
      if (saved === "sepia") return "comfort"
      if (saved === "light" || saved === "dark" || saved === "comfort") {
        return saved
      }
      return "light"
    } catch {
      return "light"
    }
  })

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("reader-theme", theme)
      } catch (error) {
        console.warn("Failed to save theme preference:", error)
      }
    }
  }, [theme])
  return [theme, setTheme] as const
}
