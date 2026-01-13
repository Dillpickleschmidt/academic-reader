import type { UploadResult } from "../types"

/** Storage interface for all file operations */
export interface Storage {
  // Upload operations (temporary files)
  uploadFile(file: ArrayBuffer, filename: string, contentType: string): Promise<UploadResult>
  getFileUrl(uploadKey: string): Promise<string>
  getFileBytes(uploadKey: string): Promise<Buffer>
  deleteUpload(uploadKey: string): Promise<boolean>

  // Document operations (permanent files)
  saveFile(key: string, content: string | Buffer): Promise<void>
  readFile(key: string): Promise<Buffer>
  readFileAsString(key: string): Promise<string>
  deleteFile(key: string): Promise<boolean>
}
