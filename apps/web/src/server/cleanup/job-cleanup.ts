import type { Storage } from "../storage/types"
import { jobFileMap } from "../storage/job-file-map"

export interface CleanupResult {
  cleaned: boolean
  uploadKey?: string
  uploadDeleted?: boolean
  deleteError?: string
}

/**
 * Clean up resources associated with a job.
 * Deletes upload file and removes job-file mapping.
 * Used for cancel/failure cases (success cleanup happens in jobs.ts).
 */
export async function cleanupJob(
  jobId: string,
  storage: Storage,
): Promise<CleanupResult> {
  const entry = jobFileMap.get(jobId)

  if (!entry) {
    return { cleaned: false }
  }

  const { uploadKey, backendType } = entry
  let uploadDeleted: boolean | undefined
  let deleteError: string | undefined

  // Local mode files are managed by the worker, not our storage
  if (backendType !== "local") {
    try {
      uploadDeleted = await storage.deleteUpload(uploadKey)
      if (!uploadDeleted) {
        deleteError = "deleteUpload returned false"
      }
    } catch (err) {
      uploadDeleted = false
      deleteError = err instanceof Error ? err.message : String(err)
    }
  }

  // Always remove from tracking
  jobFileMap.delete(jobId)

  return { cleaned: true, uploadKey, uploadDeleted, deleteError }
}
