import "../styles/json-result.css"
import {
  CodeBlock,
  CodeBlockCopyButton,
} from "@repo/core/ui/ai-elements/code-block"
import { ReaderLayout } from "../components/ReaderLayout"

interface Props {
  content: string
  onDownload: () => void
  onReset: () => void
}

export function JsonResultPage({ content, onDownload, onReset }: Props) {
  const formatted = (() => {
    try {
      return JSON.stringify(JSON.parse(content), null, 2)
    } catch (error) {
      console.warn("Failed to parse JSON content:", error)
      return content
    }
  })()

  return (
    <ReaderLayout onDownload={onDownload} onReset={onReset}>
      <CodeBlock code={formatted} language="json" showLineNumbers>
        <CodeBlockCopyButton />
      </CodeBlock>
    </ReaderLayout>
  )
}
