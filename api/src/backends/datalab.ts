import type { ConversionBackend } from './interface';
import type { ChunkOutput, ConversionInput, ConversionJob, JobStatus } from '../types';

interface DatalabConfig {
  apiKey: string;
  webhookUrl?: string;
}

interface DatalabResponse {
  request_id: string;
  status: string;
  success?: boolean;
  markdown?: string;
  html?: string;
  json?: unknown;
  chunks?: ChunkOutput;
  error?: string;
  images?: Record<string, string>;
}

/**
 * Datalab backend - hosted Marker API from Datalab.
 * API docs: https://www.datalab.to/docs/marker
 */
export class DatalabBackend implements ConversionBackend {
  readonly name = 'datalab';
  private config: DatalabConfig;
  private readonly baseUrl = 'https://www.datalab.to/api/v1/marker';

  constructor(config: DatalabConfig) {
    this.config = config;
  }

  async submitJob(input: ConversionInput): Promise<string> {
    const formData = new FormData();

    // Direct file upload - Datalab accepts file as multipart form data
    if (!input.fileData) {
      throw new Error('Datalab backend requires fileData for direct upload');
    }

    const blob = new Blob([input.fileData], { type: 'application/pdf' });
    formData.append('file', blob, input.filename || 'document.pdf');

    // Request all output formats
    formData.append('output_format', 'html,markdown,json,chunks');

    // Mode: balanced (default) or accurate (with LLM/Gemini 2.0 Flash)
    formData.append('mode', input.useLlm ? 'accurate' : 'balanced');

    if (input.forceOcr) {
      formData.append('force_ocr', 'true');
    }

    if (input.pageRange) {
      formData.append('page_range', input.pageRange);
    }

    if (this.config.webhookUrl) {
      formData.append('webhook_url', this.config.webhookUrl);
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'X-API-Key': this.config.apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Datalab submission failed: ${error}`);
    }

    const data = (await response.json()) as { request_id: string; status: string };
    return data.request_id;
  }

  async getJobStatus(jobId: string): Promise<ConversionJob> {
    const response = await fetch(`${this.baseUrl}/${jobId}`, {
      headers: {
        'X-API-Key': this.config.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get job status: ${jobId}`);
    }

    const data = (await response.json()) as DatalabResponse;
    return this.parseResponse(data);
  }

  private mapStatus(datalabStatus: string, success?: boolean): JobStatus {
    switch (datalabStatus) {
      case 'pending':
        return 'pending';
      case 'processing':
        return 'processing';
      case 'complete':
        return success ? 'completed' : 'failed';
      case 'failed':
        return 'failed';
      default:
        return 'pending';
    }
  }

  private parseResponse(data: DatalabResponse): ConversionJob {
    let htmlContent = data.html || '';

    // Embed base64 images into HTML as data URIs
    if (data.html && data.images) {
      for (const [filename, base64] of Object.entries(data.images)) {
        const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
        const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
        const dataUri = `data:${mimeType};base64,${base64}`;
        // Escape regex special chars in filename
        const escapedFilename = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`src=["']${escapedFilename}["']`, 'g');
        htmlContent = htmlContent.replace(regex, `src="${dataUri}"`);
      }
    }

    // Log all formats for future use
    if (data.chunks) {
      console.log(`[Datalab] Got ${data.chunks.blocks?.length ?? 0} chunk blocks`);
    }
    if (data.json) {
      console.log(`[Datalab] Got JSON output`);
    }
    if (data.markdown) {
      console.log(`[Datalab] Got markdown (${data.markdown.length} chars)`);
    }

    return {
      jobId: data.request_id,
      status: this.mapStatus(data.status, data.success),
      result:
        data.status === 'complete' && data.success
          ? {
              content: htmlContent,
              metadata: {},
              formats: {
                html: htmlContent,
                markdown: data.markdown || '',
                json: data.json,
                chunks: data.chunks ?? null,
              },
            }
          : undefined,
      error: data.error,
    };
  }

  supportsStreaming(): boolean {
    return false;
  }

  async handleWebhook(request: Request): Promise<ConversionJob> {
    const data = (await request.json()) as DatalabResponse;
    return this.parseResponse(data);
  }
}

/**
 * Create Datalab backend from environment.
 */
export function createDatalabBackend(env: {
  DATALAB_API_KEY?: string;
  WEBHOOK_BASE_URL?: string;
}): DatalabBackend {
  if (!env.DATALAB_API_KEY) {
    throw new Error('Datalab backend requires DATALAB_API_KEY');
  }

  return new DatalabBackend({
    apiKey: env.DATALAB_API_KEY,
    webhookUrl: env.WEBHOOK_BASE_URL ? `${env.WEBHOOK_BASE_URL}/webhooks/datalab` : undefined,
  });
}
