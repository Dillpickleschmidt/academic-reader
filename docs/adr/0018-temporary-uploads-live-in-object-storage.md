# Temporary uploads live in object storage

Academic Reader does not create Convex records for temporary uploads in v1. The app API creates a random temporary upload ID, returns a presigned direct upload URL for object storage, and later promotes that object into a Source Document only after authentication and Processing Configuration confirmation. Automated cleanup of expired unclaimed temporary uploads is not required for the first vertical slice; the known residual risk is small storage leakage until lifecycle rules, a cleanup command, or a scheduled cleanup task is added.
