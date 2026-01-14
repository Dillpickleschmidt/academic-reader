import { useState, useEffect } from "react"

interface TocItem {
  id: string
  title: string
}

export function useTableOfContents() {
  const [items, setItems] = useState<TocItem[]>([])

  useEffect(() => {
    const extractHeaders = () => {
      const container = document.querySelector(".reader-content")
      if (!container) return

      const headers = container.querySelectorAll("h1, h2")
      const tocItems: TocItem[] = []

      headers.forEach((header, index) => {
        if (!header.id) {
          header.id = `toc-${index}`
        }
        tocItems.push({
          id: header.id,
          title: header.textContent?.trim() || "",
        })
      })

      setItems(tocItems)
    }

    const timer = setTimeout(extractHeaders, 100)
    return () => clearTimeout(timer)
  }, [])

  return items
}
