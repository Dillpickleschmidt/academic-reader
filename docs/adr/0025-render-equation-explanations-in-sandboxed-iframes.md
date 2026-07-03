# Render Equation Explanations in sandboxed iframes

Equation Explanation HTML is rendered inside an app-owned sandboxed iframe instead of being inserted into the Reader View DOM. The iframe uses `sandbox="allow-scripts"` without `allow-same-origin`, `allow-forms`, `allow-popups`, `allow-top-navigation`, or similar capabilities, so generated scripts can affect their own iframe but cannot access Academic Reader's DOM, cookies, local storage, or credentials.

Academic Reader does not sanitize Equation Explanation HTML or maintain an external-resource allowlist in v1. Model output may include scripts, styles, images, fonts, and network-loaded libraries. This keeps the feature simple and gives the Reader freedom to use interactive diagrams or model-generated resources. The accepted risk is that a Reader can hurt their own session or expose their own Document content through network-capable generated HTML; the protected invariant is that generated HTML must not break the parent app or other Readers.

The parent app wraps the model fragment in a controlled iframe document that supplies reader theme CSS variables, baseline typography, and any app-owned shell behavior. The parent only accepts a narrow resize message from the iframe's `contentWindow`, clamps the requested height to the app-defined maximum, and ignores all other iframe messages.
