import { Highlight, themes } from "prism-react-renderer"
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
    } catch {
      return content
    }
  })()

  return (
    <ReaderLayout onDownload={onDownload} onReset={onReset}>
      <Highlight theme={themes.vsLight} code={formatted} language="json">
        {({ style, tokens, getLineProps, getTokenProps }) => (
          <pre className="dark:hidden" style={style}>
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
      <Highlight theme={themes.vsDark} code={formatted} language="json">
        {({ style, tokens, getLineProps, getTokenProps }) => (
          <pre className="hidden dark:block" style={style}>
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </ReaderLayout>
  )
}
