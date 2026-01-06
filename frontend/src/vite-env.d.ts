/// <reference types="vite/client" />

declare module "*.css?raw" {
  const content: string
  export default content
}

declare module "katex/dist/contrib/copy-tex"
