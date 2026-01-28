import type { ConversionBackend } from "./interface"
import type { Storage } from "../storage/types"
import { createLocalBackend } from "./local"
import { createDatalabBackend } from "./datalab"
import { ModalBackend } from "./modal"
import { env } from "../env"

/**
 * Create the appropriate backend based on environment configuration.
 * @param storage - Required for Modal backend (presigned URL generation)
 */
export function createBackend(storage: Storage): ConversionBackend {
  switch (env.BACKEND_MODE) {
    case "local":
      return createLocalBackend()

    case "datalab":
      return createDatalabBackend({
        DATALAB_API_KEY: env.DATALAB_API_KEY,
      })

    case "modal":
      return new ModalBackend(
        {
          marker: env.MODAL_MARKER_URL!,
          lightonocr: env.MODAL_LIGHTONOCR_URL,
          chandra: env.MODAL_CHANDRA_URL,
        },
        storage,
      )
  }
}
