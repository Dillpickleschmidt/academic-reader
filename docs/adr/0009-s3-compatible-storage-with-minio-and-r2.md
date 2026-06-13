# Support MinIO and R2 storage

Academic Reader supports both MinIO and R2 object storage from v1, following the old app's deployment model. MinIO keeps the fully self-hosted path straightforward, while R2 preserves a low-maintenance hosted storage option; both should be accessed through the same storage service shape so document processing does not branch on storage provider details.
