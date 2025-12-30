import type { ReactNode } from "react"
import { Download, Plus, Sun, BookOpen, Moon } from "lucide-react"
import { useReaderTheme, type ReaderTheme } from "../hooks/useReaderTheme"

const THEME_ICONS: Record<ReaderTheme, ReactNode> = {
  light: <Sun size={18} />,
  comfort: <BookOpen size={18} />,
  dark: <Moon size={18} />,
}

interface Props {
  children: ReactNode
  onDownload: () => void
  onReset: () => void
  showThemeToggle?: boolean
}

export function ReaderLayout({
  children,
  onDownload,
  onReset,
  showThemeToggle = false,
}: Props) {
  const [theme, setTheme] = useReaderTheme()

  return (
    <div
      className="reader-output"
      data-theme={theme === "light" ? undefined : theme}
    >
      {showThemeToggle && (
        <div className="reader-theme-toggle">
          {(["light", "comfort", "dark"] as const).map((t) => (
            <button
              key={t}
              className={theme === t ? "active" : ""}
              onClick={() => setTheme(t)}
              title={t.charAt(0).toUpperCase() + t.slice(1)}
            >
              {THEME_ICONS[t]}
            </button>
          ))}
        </div>
      )}
      <div className="reader-actions">
        <button onClick={onDownload} title="Download">
          <Download size={18} />
        </button>
        <button onClick={onReset} title="New">
          <Plus size={18} />
        </button>
      </div>
      <div className="reader-content">{children}</div>
    </div>
  )
}
