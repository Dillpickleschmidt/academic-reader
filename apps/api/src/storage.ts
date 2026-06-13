import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import type { SourceDocumentMimeType } from "@academic-reader/shared/uploads";
import { AwsClient } from "aws4fetch";

export interface TemporaryUploadInput {
	filename: string;
	mimeType: SourceDocumentMimeType;
	sizeBytes: number;
}

interface SaveObjectOptions {
	contentType?: string;
	cacheControl?: string;
}

export async function createTemporaryUpload(input: TemporaryUploadInput) {
	const config = readStorageConfig();
	const temporaryUploadId = randomUUID();
	const sourceObjectKey = temporaryUploadObjectKey(
		temporaryUploadId,
		input.filename,
	);
	const uploadUrl = await getPresignedUploadUrl(
		config,
		sourceObjectKey,
		input.mimeType,
	);

	return {
		temporaryUploadId,
		uploadUrl,
		expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
		headers: {
			"Content-Type": input.mimeType,
		},
	};
}

export async function promoteTemporaryUpload(input: {
	temporaryUploadId: string;
	filename: string;
}) {
	const config = readStorageConfig();
	const sourceObjectKey = temporaryUploadObjectKey(
		input.temporaryUploadId,
		input.filename,
	);
	const objectKey = `source-documents/${randomUUID()}/${safeFilename(input.filename)}`;
	await copyObject(config, sourceObjectKey, objectKey);
	await deleteObject(config, sourceObjectKey);

	return { objectKey };
}

export async function getWorkerPresignedReadUrl(objectKey: string) {
	const config = readStorageConfig();
	return getPresignedReadUrl(
		config,
		objectKey,
		workerPresignedEndpoint(config),
	);
}

export async function saveObject(
	objectKey: string,
	content: string | Buffer | Uint8Array,
	options: SaveObjectOptions = {},
) {
	const config = readStorageConfig();
	const headers: Record<string, string> = {};
	if (options.contentType) headers["Content-Type"] = options.contentType;
	if (options.cacheControl) headers["Cache-Control"] = options.cacheControl;

	const response = await storageClient(config).fetch(
		objectUrl(config.endpoint, config.bucket, objectKey),
		{
			method: "PUT",
			headers,
			body: requestBody(content),
		},
	);

	if (!response.ok) {
		throw new Error(`Could not save object (${response.status})`);
	}
}

export async function readObject(objectKey: string) {
	const config = readStorageConfig();
	const response = await storageClient(config).fetch(
		objectUrl(config.endpoint, config.bucket, objectKey),
		{ method: "GET" },
	);

	if (!response.ok) {
		throw new Error(`Could not read object (${response.status})`);
	}

	return Buffer.from(await response.arrayBuffer());
}

export function sourceDocumentImageObjectKey(
	sourceDocumentId: string,
	filename: string,
) {
	return `source-documents/${sourceDocumentId}/images/${safeFilename(filename)}`;
}

export function sourceDocumentImageUrl(
	sourceDocumentId: string,
	filename: string,
) {
	return `/api/source-documents/${encodeURIComponent(sourceDocumentId)}/images/${encodeURIComponent(safeFilename(filename))}`;
}

function readStorageConfig() {
	return {
		endpoint: requireEnv("S3_API_ENDPOINT"),
		presignedEndpoint: requireEnv("S3_PRESIGNED_URL_ENDPOINT"),
		region: requireEnv("S3_REGION"),
		accessKeyId: requireEnv("S3_ACCESS_KEY"),
		secretAccessKey: requireEnv("S3_SECRET_KEY"),
		bucket: requireEnv("S3_BUCKET"),
	};
}

async function getPresignedUploadUrl(
	config: ReturnType<typeof readStorageConfig>,
	objectKey: string,
	mimeType: SourceDocumentMimeType,
) {
	const url = objectUrl(config.presignedEndpoint, config.bucket, objectKey);
	url.searchParams.set("X-Amz-Expires", String(60 * 60));
	const signedRequest = await storageClient(config).sign(
		new Request(url, {
			method: "PUT",
			headers: {
				"Content-Type": mimeType,
			},
		}),
		{ aws: { signQuery: true } },
	);

	return signedRequest.url;
}

function workerPresignedEndpoint(config: ReturnType<typeof readStorageConfig>) {
	const configured = optionalEnv("S3_WORKER_PRESIGNED_URL_ENDPOINT");
	if (configured) return configured;
	if (optionalEnv("CONVERSION_BACKEND") === "local")
		return "http://localhost:9000";
	if (!isLocalUrl(config.presignedEndpoint)) return config.presignedEndpoint;

	throw new Error(
		"S3_WORKER_PRESIGNED_URL_ENDPOINT is required for Modal when S3_PRESIGNED_URL_ENDPOINT is local. `bun run dev` starts a tunnel and sets this automatically.",
	);
}

async function getPresignedReadUrl(
	config: ReturnType<typeof readStorageConfig>,
	objectKey: string,
	endpoint: string,
) {
	const url = objectUrl(endpoint, config.bucket, objectKey);
	url.searchParams.set("X-Amz-Expires", String(60 * 60));
	const signedRequest = await storageClient(config).sign(
		new Request(url, { method: "GET" }),
		{ aws: { signQuery: true } },
	);

	return signedRequest.url;
}

function objectUrl(endpoint: string, bucket: string, key: string) {
	return new URL(
		`${endpoint.replace(/\/$/, "")}/${encodeURIComponent(bucket)}/${key
			.split("/")
			.map(encodeURIComponent)
			.join("/")}`,
	);
}

async function copyObject(
	config: ReturnType<typeof readStorageConfig>,
	sourceObjectKey: string,
	destinationObjectKey: string,
) {
	const client = storageClient(config);
	const response = await client.fetch(
		objectUrl(config.endpoint, config.bucket, destinationObjectKey),
		{
			method: "PUT",
			headers: {
				"x-amz-copy-source": copySource(config.bucket, sourceObjectKey),
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Could not promote upload (${response.status})`);
	}
}

async function deleteObject(
	config: ReturnType<typeof readStorageConfig>,
	objectKey: string,
) {
	const client = storageClient(config);
	const response = await client.fetch(
		objectUrl(config.endpoint, config.bucket, objectKey),
		{ method: "DELETE" },
	);

	if (!response.ok && response.status !== 404) {
		throw new Error(`Could not delete temporary upload (${response.status})`);
	}
}

function storageClient(config: ReturnType<typeof readStorageConfig>) {
	return new AwsClient({
		accessKeyId: config.accessKeyId,
		secretAccessKey: config.secretAccessKey,
		region: config.region,
		service: "s3",
	});
}

function requestBody(content: string | Buffer | Uint8Array) {
	if (typeof content === "string") return content;

	const bytes = content instanceof Buffer ? content : Buffer.from(content);
	const arrayBuffer = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(arrayBuffer).set(bytes);
	return arrayBuffer;
}

function copySource(bucket: string, key: string) {
	return `/${encodeURIComponent(bucket)}/${key
		.split("/")
		.map(encodeURIComponent)
		.join("/")}`;
}

function temporaryUploadObjectKey(temporaryUploadId: string, filename: string) {
	return `temporary-uploads/${temporaryUploadId}/${safeFilename(filename)}`;
}

function safeFilename(filename: string) {
	return (
		filename
			.trim()
			.replace(/[^a-zA-Z0-9._-]+/g, "-")
			.replace(/^-+|-+$/g, "") || "source-document"
	);
}

function isLocalUrl(value: string) {
	try {
		const { hostname } = new URL(value);
		return hostname === "localhost" || hostname === "127.0.0.1";
	} catch {
		return false;
	}
}

function optionalEnv(key: string) {
	return process.env[key]?.trim() || undefined;
}

function requireEnv(key: string) {
	const value = optionalEnv(key);

	if (!value) {
		throw new Error(`${key} is required`);
	}

	return value;
}
