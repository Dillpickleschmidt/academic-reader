# Do not sanitize block HTML in v1

Academic Reader does not sanitize Block `contentHtml` in v1. The app is authenticated and readers are expected to work with their own Source Documents, so v1 prioritizes a smaller document-rendering pipeline and avoids maintaining sanitization rules until concrete fixtures or deployment needs justify the extra processing step.
