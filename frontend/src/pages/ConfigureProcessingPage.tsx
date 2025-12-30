import {
  FileText,
  Check,
  Code,
  AlignLeft,
  Braces,
  ScanLine,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { InfoTooltip } from "@/components/info-tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { OutputFormat } from "../hooks/useConversion"

interface Props {
  fileName: string
  uploadProgress: number
  uploadComplete: boolean
  outputFormat: OutputFormat
  useLlm: boolean
  forceOcr: boolean
  pageRange: string
  error: string
  isProcessing: boolean
  onOutputFormatChange: (format: OutputFormat) => void
  onUseLlmChange: (value: boolean) => void
  onForceOcrChange: (value: boolean) => void
  onPageRangeChange: (value: string) => void
  onStartConversion: () => void
  onBack: () => void
}

type Step = "upload" | "configure" | "convert"

function StepIndicator({
  step,
  label,
  isComplete,
  isActive,
  isProcessing,
}: {
  step: number
  label: string
  isComplete: boolean
  isActive: boolean
  isProcessing?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors",
          isComplete
            ? "bg-primary text-primary-foreground"
            : isActive
              ? "bg-primary/10 text-primary border border-primary"
              : "bg-muted text-muted-foreground",
        )}
      >
        {isComplete ? (
          <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
        ) : isProcessing ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.5} />
        ) : (
          step
        )}
      </div>
      <span
        className={cn(
          "text-sm transition-colors",
          isComplete || isActive ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </div>
  )
}

export function ConfigureProcessingPage({
  fileName,
  uploadProgress,
  uploadComplete,
  outputFormat,
  useLlm,
  forceOcr,
  pageRange,
  error,
  isProcessing,
  onOutputFormatChange,
  onUseLlmChange,
  onForceOcrChange,
  onPageRangeChange,
  onStartConversion,
  onBack,
}: Props) {
  const currentStep: Step = isProcessing ? "convert" : "configure"

  return (
    <div className="min-h-screen flex flex-col p-6 px-5 bg-background">
      <div className="flex items-center gap-2 text-base font-medium text-muted-foreground">
        Academic Reader
      </div>

      <main className="flex flex-col items-center justify-center flex-1 pb-16">
        <div
          className={cn(
            "w-full max-w-[720px] grid gap-8 transition-all duration-300 ease-out",
            isProcessing
              ? "grid-cols-1 max-w-[320px]"
              : "grid-cols-[240px_1fr] max-sm:grid-cols-1",
          )}
        >
          {/* Steps Panel */}
          <div
            className={cn(
              "flex flex-col gap-5 p-6 rounded-xl border border-border",
              "transition-all duration-300 ease-out",
              isProcessing && "items-center text-center",
            )}
          >
            {/* File info - at top */}
            <div className="pb-4 border-b border-border">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                <span className="truncate max-w-[180px] text-foreground font-medium">
                  {fileName}
                </span>
                {uploadComplete && (
                  <Check
                    className="w-4 h-4 text-green-600 dark:text-green-500 shrink-0"
                    strokeWidth={2}
                  />
                )}
              </div>
              {!uploadComplete && (
                <div className="mt-1.5 text-xs text-muted-foreground">
                  Uploading... {uploadProgress}%
                </div>
              )}
            </div>

            {/* Steps */}
            <div className="flex flex-col gap-4">
              <StepIndicator
                step={1}
                label="Upload"
                isComplete={uploadComplete}
                isActive={!uploadComplete}
              />
              <StepIndicator
                step={2}
                label="Configure"
                isComplete={isProcessing}
                isActive={currentStep === "configure"}
              />
              <StepIndicator
                step={3}
                label={isProcessing ? "Converting..." : "Convert"}
                isComplete={false}
                isActive={currentStep === "convert"}
                isProcessing={isProcessing}
              />
            </div>

            {isProcessing && (
              <p className="text-xs text-muted-foreground max-w-[200px] mt-2">
                This may take a moment depending on the document size
              </p>
            )}
          </div>

          {/* Configuration Panel */}
          <div
            className={cn(
              "flex flex-col gap-6 p-6 rounded-xl border border-border",
              "transition-all duration-300 ease-out",
              isProcessing && "opacity-0 scale-95 absolute pointer-events-none",
            )}
          >
            {/* Output Format */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Output Format
              </label>
              <Select
                value={outputFormat}
                onValueChange={(value) =>
                  onOutputFormatChange(value as OutputFormat)
                }
              >
                <SelectTrigger className="w-full h-10">
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      {outputFormat === "html" && (
                        <>
                          <Code className="w-4 h-4" strokeWidth={1.5} />
                          <span>HTML</span>
                          <span className="text-muted-foreground text-xs">
                            (Recommended)
                          </span>
                        </>
                      )}
                      {outputFormat === "markdown" && (
                        <>
                          <AlignLeft className="w-4 h-4" strokeWidth={1.5} />
                          <span>Markdown</span>
                        </>
                      )}
                      {outputFormat === "json" && (
                        <>
                          <Braces className="w-4 h-4" strokeWidth={1.5} />
                          <span>JSON</span>
                        </>
                      )}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="html">
                    <Code className="w-4 h-4" strokeWidth={1.5} />
                    HTML
                    <span className="text-muted-foreground text-xs ml-1">
                      (Recommended)
                    </span>
                  </SelectItem>
                  <SelectItem value="markdown">
                    <AlignLeft className="w-4 h-4" strokeWidth={1.5} />
                    Markdown
                  </SelectItem>
                  <SelectItem value="json">
                    <Braces className="w-4 h-4" strokeWidth={1.5} />
                    JSON
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Page Range */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Page Range{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </label>
              <Input
                type="text"
                className="h-10"
                placeholder="All pages — or specify: 1-5, 10, 15-20"
                value={pageRange}
                onChange={(e) => onPageRangeChange(e.target.value)}
              />
            </div>

            {/* Options */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center bg-muted text-muted-foreground">
                    <Sparkles className="w-4 h-4" strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      Enhanced Detection
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <span>
                        Use Gemini Flash 2 for better tables & equations
                      </span>
                      <InfoTooltip
                        variant="info"
                        content="Note that Google collects anything read by Gemini for training purposes."
                        side="top"
                      />
                    </div>
                  </div>
                </div>
                <Switch checked={useLlm} onCheckedChange={onUseLlmChange} />
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center bg-muted text-muted-foreground">
                    <ScanLine className="w-4 h-4" strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      Force OCR
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <span>Can help with equations</span>
                      <InfoTooltip
                        content="This is only applicable to searchable, text-based PDFs since scanned documents are subjected to OCR automatically."
                        side="top"
                      />
                    </div>
                  </div>
                </div>
                <Switch checked={forceOcr} onCheckedChange={onForceOcrChange} />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-2">
              <Button variant="outline" onClick={onBack} className="h-10">
                <ArrowLeft className="w-4 h-4 mr-2" strokeWidth={2} />
                Back
              </Button>
              <Button
                onClick={onStartConversion}
                disabled={!uploadComplete}
                className="flex-1 h-10"
              >
                {uploadComplete ? (
                  "Convert"
                ) : (
                  <>
                    <Loader2
                      className="w-4 h-4 mr-2 animate-spin"
                      strokeWidth={2}
                    />
                    Uploading...
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-6 flex items-center gap-2 py-3 px-4 bg-destructive/10 rounded-lg text-destructive text-sm max-w-[720px]">
            <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.5} />
            <span>{error}</span>
          </div>
        )}
      </main>
    </div>
  )
}
