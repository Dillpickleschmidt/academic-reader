import { useState, useEffect } from "react"

export type ReaderTheme = "light" | "comfort" | "dark"

export function useReaderTheme() {
  const [theme, setTheme] = useState<ReaderTheme>(() => {
    const saved = localStorage.getItem("reader-theme")
    if (saved === "sepia") return "comfort"
    return (saved as ReaderTheme) || "light"
  })

  useEffect(() => {
    localStorage.setItem("reader-theme", theme)
  }, [theme])

  return [theme, setTheme] as const
}
