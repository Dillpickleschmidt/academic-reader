import {
  createContext,
  useContext,
  useRef,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { toast } from "sonner"

type TTSState = {
  isEnabled: boolean
  isLoading: boolean
  currentBlockId: string | null
  rewordedText: string | null
  error: string | null
}

type TTSStore = {
  getState: () => TTSState
  setState: (partial: Partial<TTSState>) => void
  subscribe: (listener: () => void) => () => void
}

function createStore(initial: TTSState): TTSStore {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    getState: () => state,
    setState: (partial) => {
      state = { ...state, ...partial }
      listeners.forEach((l) => l())
    },
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
}

type TTSActions = {
  enable: () => void
  disable: () => void
  loadChunkTTS: (blockId: string, chunkContent: string) => Promise<void>
}

const TTSContext = createContext<{ store: TTSStore; actions: TTSActions } | null>(null)

export function TTSProvider({ documentId, children }: { documentId: string | null; children: ReactNode }) {
  const storeRef = useRef<TTSStore>(null!)
  if (!storeRef.current) {
    storeRef.current = createStore({
      isEnabled: false,
      isLoading: false,
      currentBlockId: null,
      rewordedText: null,
      error: null,
    })
  }
  const store = storeRef.current

  const enable = useCallback(() => {
    store.setState({ isEnabled: true, error: null })
  }, [store])

  const disable = useCallback(() => {
    store.setState({ isEnabled: false, rewordedText: null, currentBlockId: null, error: null })
  }, [store])

  const loadChunkTTS = useCallback(
    async (blockId: string, chunkContent: string) => {
      if (!documentId) {
        store.setState({ error: "Document not saved - TTS requires a saved document" })
        toast.error("Document not saved - TTS requires a saved document")
        return
      }

      store.setState({ isLoading: true, error: null, currentBlockId: blockId })
      const toastId = toast.loading("Rewriting text for speech...")

      try {
        const response = await fetch("/api/tts/rewrite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ documentId, blockId, chunkContent }),
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error || "Failed to reword text")
        }

        const data = await response.json()
        store.setState({ rewordedText: data.rewordedText, isLoading: false })
        toast.success(data.cached ? "Loaded from cache" : "Text rewritten for speech", { id: toastId })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "TTS processing failed"
        store.setState({ error: errorMsg, rewordedText: null, isLoading: false })
        toast.error(errorMsg, { id: toastId })
      }
    },
    [store, documentId]
  )

  const valueRef = useRef<{ store: TTSStore; actions: TTSActions }>(null!)
  if (!valueRef.current) {
    valueRef.current = { store, actions: { enable, disable, loadChunkTTS } }
  }
  valueRef.current.actions = { enable, disable, loadChunkTTS }

  return <TTSContext.Provider value={valueRef.current}>{children}</TTSContext.Provider>
}

function useTTSContext() {
  const ctx = useContext(TTSContext)
  if (!ctx) throw new Error("TTS hooks must be used within TTSProvider")
  return ctx
}

export function useTTSSelector<T>(selector: (state: TTSState) => T): T {
  const { store } = useTTSContext()
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()))
}

export function useTTSActions(): TTSActions {
  return useTTSContext().actions
}
