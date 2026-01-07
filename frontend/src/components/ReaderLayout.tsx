import { lazy, Suspense, useEffect, useRef, type ReactNode } from "react"
import { BotMessageSquare, Download, Plus } from "lucide-react"
import { THEMES, type ReaderTheme } from "../constants/themes"
import { useReaderTheme } from "../hooks/useReaderTheme"

const AIChat = lazy(() =>
  import("./AI-Chat").then((m) => ({ default: m.AIChat })),
)

interface Props {
  children: ReactNode
  onDownload: () => void
  onReset: () => void
  showThemeToggle?: boolean
  showAIChat?: boolean
  downloadDisabled?: boolean
}

export function ReaderLayout({
  children,
  onDownload,
  onReset,
  showThemeToggle = false,
  showAIChat = false,
  downloadDisabled = false,
}: Props) {
  const [theme, setTheme] = useReaderTheme()
  const radioRefs = useRef<Record<ReaderTheme, HTMLInputElement | null>>({
    light: null,
    comfort: null,
    dark: null,
  })

  // Sync radio buttons with theme state
  useEffect(() => {
    const radio = radioRefs.current[theme]
    if (radio && !radio.checked) {
      radio.checked = true
    }
  }, [theme])

  const handleRadioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTheme = e.target.value as ReaderTheme
    setTheme(newTheme)
  }

  return (
    <>
      {/* Hidden radio inputs - must be siblings before .reader-output for CSS selectors */}
      {THEMES.map((t) => (
        <input
          key={t.id}
          ref={(el) => {
            radioRefs.current[t.id] = el
          }}
          type="radio"
          name="theme"
          id={`theme-${t.id}`}
          value={t.id}
          defaultChecked={t.id === theme}
          onChange={handleRadioChange}
          className="theme-radios"
        />
      ))}

      <div className="reader-output">
        {showAIChat && (
          <Suspense>
            <AIChat
              trigger={
                <button className="reader-ai-button" title="AI Summary">
                  <BotMessageSquare size={18} />
                </button>
              }
            />
          </Suspense>
        )}
        {showThemeToggle && (
          <div className="reader-theme-toggle">
            {THEMES.map((t) => {
              const Icon = t.icon
              return (
                <label key={t.id} htmlFor={`theme-${t.id}`} title={t.title}>
                  <Icon size={18} />
                </label>
              )
            })}
          </div>
        )}
        <div className="reader-actions">
          <button
            onClick={onDownload}
            title={downloadDisabled ? "Waiting for images..." : "Download"}
            disabled={downloadDisabled}
            className={downloadDisabled ? "opacity-50" : ""}
          >
            <Download size={18} />
          </button>
          <button onClick={onReset} title="New">
            <Plus size={18} />
          </button>
        </div>
        <div className="reader-content">{children}</div>
      </div>
    </>
  )
}
