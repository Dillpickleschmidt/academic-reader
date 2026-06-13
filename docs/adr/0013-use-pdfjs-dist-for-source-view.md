# Use pdfjs-dist for PDF source view

Academic Reader uses `pdfjs-dist` directly to render PDF pages in the Source View. Direct PDF.js access keeps page rendering, coordinate conversion, sub-page jumps, and Debug Overlay layers under app control; wrapper viewers and native PDF embeds are avoided unless a concrete need appears.
