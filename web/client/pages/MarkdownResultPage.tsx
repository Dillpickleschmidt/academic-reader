import "../styles/markdown-result.css"
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

export function MarkdownResultPage({ content, onDownload, onReset }: Props) {
  return (
    <ReaderLayout onDownload={onDownload} onReset={onReset} showThemeToggle>
      <CodeBlock code={content} language="markdown" showLineNumbers>
        <CodeBlockCopyButton />
      </CodeBlock>
    </ReaderLayout>
  )
}
