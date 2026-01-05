import { useState, useRef, useCallback } from "react"
import * as api from "../api"
import type { ConversionProgress } from "../api"
import { downloadFromApi, downloadContent, type OutputFormat } from "../utils/download"

export type Page = "upload" | "configure" | "processing" | "result"
export type { OutputFormat }

export interface StageInfo {
  stage: string
  current: number
  total: number
  elapsed: number
  completed: boolean
}

export function useConversion() {
  // Navigation
  const [page, setPage] = useState<Page>("upload")

  // File state
  const [fileId, setFileId] = useState("")
  const [fileName, setFileName] = useState("")
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadComplete, setUploadComplete] = useState(false)
  const [url, setUrl] = useState("")

  // Config options
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("html")
  const [useLlm, setUseLlm] = useState(false)
  const [forceOcr, setForceOcr] = useState(false)
  const [pageRange, setPageRange] = useState("")

  // Processing state
  const [jobId, setJobId] = useState("")
  const [content, setContent] = useState("")
  const [error, setError] = useState("")
  const [imagesReady, setImagesReady] = useState(false)
  const [stages, setStages] = useState<StageInfo[]>([])

  // SSE cleanup ref
  const sseCleanupRef = useRef<(() => void) | null>(null)

  // Shared stage update logic for SSE and polling
  const updateStages = useCallback((progress: ConversionProgress) => {
    setStages((prev) => {
      const stageInfo: StageInfo = {
        ...progress,
        completed: progress.current >= progress.total,
      }
      const existing = prev.find((s) => s.stage === progress.stage)
      if (existing) {
        return prev.map((s) => (s.stage === progress.stage ? stageInfo : s))
      }
      return [
        ...prev.map((s) => ({ ...s, completed: true, current: s.total })),
        { ...stageInfo, completed: false },
      ]
    })
  }, [])

  const reset = () => {
    // Clean up any active SSE connection
    if (sseCleanupRef.current) {
      sseCleanupRef.current()
      sseCleanupRef.current = null
    }

    setPage("upload")
    setFileId("")
    setFileName("")
    setUploadProgress(0)
    setUploadComplete(false)
    setUrl("")
    setOutputFormat("html")
    setUseLlm(false)
    setForceOcr(false)
    setPageRange("")
    setJobId("")
    setContent("")
    setError("")
    setImagesReady(false)
    setStages([])
  }

  const uploadFile = async (file: File) => {
    setFileName(file.name)
    setPage("configure")
    setUploadProgress(0)
    setUploadComplete(false)
    setError("")

    // Pre-warm models when upload starts (fire-and-forget)
    api.warmModels()

    try {
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90))
      }, 200)

      const data = await api.uploadFile(file)

      clearInterval(progressInterval)
      setFileId(data.file_id)
      setUploadProgress(100)
      setUploadComplete(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
      setPage("upload")
    }
  }

  const fetchFromUrl = async () => {
    if (!url.trim()) return

    setFileName(url.split("/").pop()?.split("?")[0] || "document")
    setPage("configure")
    setUploadProgress(0)
    setUploadComplete(false)
    setError("")

    // Pre-warm models when fetch starts (fire-and-forget)
    api.warmModels()

    try {
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 5, 90))
      }, 300)

      const data = await api.fetchFromUrl(url)

      clearInterval(progressInterval)
      setFileId(data.file_id)
      setFileName(data.filename)
      setUploadProgress(100)
      setUploadComplete(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch URL")
      setPage("upload")
    }
  }

  const startConversion = async () => {
    setPage("processing")
    setError("")
    setImagesReady(false)
    setStages([])

    try {
      const { job_id } = await api.startConversion(fileId, {
        outputFormat,
        useLlm,
        forceOcr,
        pageRange,
      })
      setJobId(job_id)

      const cleanup = api.subscribeToJob(
        job_id,
        (progress: ConversionProgress) => updateStages(progress),
        (htmlContent) => {
          setContent(htmlContent)
          setPage("result")
        },
        (result) => {
          setContent(result.content)
          setImagesReady(true)
          setPage("result")
          sseCleanupRef.current = null
        },
        (errorMsg) => {
          setError(errorMsg)
          sseCleanupRef.current = null
        },
      )

      sseCleanupRef.current = cleanup
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversion failed")
    }
  }

  const handleDownload = () => {
    if (outputFormat === "html" && jobId) {
      downloadFromApi(jobId, fileName)
    } else {
      downloadContent(content, fileName, outputFormat)
    }
  }

  return {
    // State
    page,
    fileId,
    fileName,
    uploadProgress,
    uploadComplete,
    url,
    outputFormat,
    useLlm,
    forceOcr,
    pageRange,
    content,
    error,
    imagesReady,
    stages,

    // Setters
    setUrl,
    setOutputFormat,
    setUseLlm,
    setForceOcr,
    setPageRange,

    // Actions
    reset,
    uploadFile,
    fetchFromUrl,
    startConversion,
    downloadResult: handleDownload,
  }
}
