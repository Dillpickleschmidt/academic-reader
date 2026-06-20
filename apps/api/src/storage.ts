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
	const objectKey = `documents/${randomUUID()}/source/${safeFilename(input.filename)}`;
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
		60 * 60,
	);
}

export async function getBrowserPresignedReadUrl(objectKey: string) {
	const config = readStorageConfig();
	const expiresInSeconds = 15 * 60;

	return {
		url: await getPresignedReadUrl(
			config,
			objectKey,
			config.presignedEndpoint,
			expiresInSeconds,
		),
		expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
	};
}

export async function getObjectBytes(objectKey: string) {
	const config = readStorageConfig();
	const response = await storageClient(config).fetch(
		objectUrl(config.endpoint, config.bucket, objectKey),
		{ method: "GET" },
	);

	if (!response.ok) {
		throw new Error(`Could not read object (${response.status})`);
	}

	return new Uint8Array(await response.arrayBuffer());
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

export async function deleteDocumentObjects(input: {
	documentId: string;
	sourceDocumentObjectKey: string;
}) {
	const config = readStorageConfig();

	await deleteObject(config, input.sourceDocumentObjectKey);
	await deleteObjectsByPrefix(config, `documents/${input.documentId}/`);
}

export function documentImageObjectKey(documentId: string, filename: string) {
	return `documents/${documentId}/images/${safeFilename(filename)}`;
}

export function documentImageUrl(documentId: string, filename: string) {
	return `/api/documents/${encodeURIComponent(documentId)}/images/${encodeURIComponent(safeFilename(filename))}`;
}

export function documentNarrationAudioObjectKey(
	documentId: string,
	voice: string,
	blockId: string,
) {
	return `documents/${documentId}/narration-audio/${safeFilename(voice)}/${Buffer.from(blockId).toString("base64url")}.wav`;
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
	expiresInSeconds: number,
) {
	const url = objectUrl(endpoint, config.bucket, objectKey);
	url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
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
		throw new Error(`Could not delete object (${response.status})`);
	}
}

async function deleteObjectsByPrefix(
	config: ReturnType<typeof readStorageConfig>,
	prefix: string,
) {
	let continuationToken: string | undefined;

	do {
		const page = await listObjectKeys(config, prefix, continuationToken);
		for (const key of page.keys) {
			await deleteObject(config, key);
		}
		continuationToken = page.nextContinuationToken;
	} while (continuationToken);
}

async function listObjectKeys(
	config: ReturnType<typeof readStorageConfig>,
	prefix: string,
	continuationToken: string | undefined,
) {
	const url = objectUrl(config.endpoint, config.bucket, "");
	url.searchParams.set("list-type", "2");
	url.searchParams.set("prefix", prefix);
	if (continuationToken) {
		url.searchParams.set("continuation-token", continuationToken);
	}

	const response = await storageClient(config).fetch(url, { method: "GET" });
	if (!response.ok) {
		throw new Error(`Could not list objects (${response.status})`);
	}

	const xml = await response.text();
	const continuationTokenMatch = xml.match(
		/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/,
	);

	return {
		keys: [...xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)].map((match) =>
			decodeXmlText(match[1] ?? ""),
		),
		nextContinuationToken:
			continuationTokenMatch?.[1] === undefined
				? undefined
				: decodeXmlText(continuationTokenMatch[1]),
	};
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

function decodeXmlText(value: string) {
	return value
		.replace(/&#x([0-9a-fA-F]+);/g, (_, codePoint: string) =>
			String.fromCodePoint(Number.parseInt(codePoint, 16)),
		)
		.replace(/&#([0-9]+);/g, (_, codePoint: string) =>
			String.fromCodePoint(Number.parseInt(codePoint, 10)),
		)
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");
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
