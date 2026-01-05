/**
 * Temporary file storage for Datalab direct upload.
 * Files are stored between upload and convert requests, then deleted.
 */

export interface TempFile {
  data: ArrayBuffer;
  filename: string;
  contentType: string;
  expiresAt: number;
}

export interface TempStorage {
  store(id: string, file: TempFile): Promise<void>;
  retrieve(id: string): Promise<TempFile | null>;
  delete(id: string): Promise<void>;
}

/**
 * In-memory temp storage for self-hosted deployments.
 * Files are stored in memory with TTL-based cleanup.
 */
export class MemoryTempStorage implements TempStorage {
  private files = new Map<string, TempFile>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(cleanupIntervalMs = 60000) {
    // Cleanup expired files periodically
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, cleanupIntervalMs);
  }

  async store(id: string, file: TempFile): Promise<void> {
    this.files.set(id, file);
  }

  async retrieve(id: string): Promise<TempFile | null> {
    const file = this.files.get(id);
    if (!file) return null;

    // Check if expired
    if (Date.now() > file.expiresAt) {
      this.files.delete(id);
      return null;
    }

    return file;
  }

  async delete(id: string): Promise<void> {
    this.files.delete(id);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, file] of this.files.entries()) {
      if (now > file.expiresAt) {
        this.files.delete(id);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.files.clear();
  }
}
