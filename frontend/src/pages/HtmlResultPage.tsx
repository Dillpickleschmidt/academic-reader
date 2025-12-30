import { ReaderLayout } from "../components/ReaderLayout"

interface Props {
  content: string
  onDownload: () => void
  onReset: () => void
}

export function HtmlResultPage({ content, onDownload, onReset }: Props) {
  return (
    <ReaderLayout onDownload={onDownload} onReset={onReset} showThemeToggle>
      <div dangerouslySetInnerHTML={{ __html: content }} />
    </ReaderLayout>
  )
}
