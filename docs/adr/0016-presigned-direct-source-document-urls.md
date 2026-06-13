# Serve source documents with presigned direct URLs

Academic Reader serves original Source Documents to the Source View through short-lived presigned direct storage URLs after an authenticated ownership check. This keeps large PDF/image traffic off the app server and lets PDF.js benefit from storage-native range requests while keeping the stored document private.
