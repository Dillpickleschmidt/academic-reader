import { ReaderLayout } from "../components/ReaderLayout"

interface Props {
  content: string
  onDownload: () => void
  onReset: () => void
}

export function MarkdownResultPage({ content, onDownload, onReset }: Props) {
  return (
    <ReaderLayout onDownload={onDownload} onReset={onReset} showThemeToggle>
      <pre>{content}</pre>
    </ReaderLayout>
  )
}
