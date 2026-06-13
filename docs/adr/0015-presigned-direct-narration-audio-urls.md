# Serve narration audio with presigned direct URLs

Academic Reader serves Narration audio through short-lived presigned direct storage URLs after an authenticated ownership check. This keeps large and seekable audio traffic off the app server while preserving private access; images and smaller document assets may continue to use app-owned authenticated routes unless performance shows they need the same treatment.
