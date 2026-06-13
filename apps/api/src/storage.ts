import { randomUUID } from "node:crypto";
import type { SourceDocumentMimeType } from "@academic-reader/shared/uploads";
import { AwsClient } from "aws4fetch";

export interface TemporaryUploadInput {
	filename: string;
	mimeType: SourceDocumentMimeType;
	sizeBytes: number;
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
	const client = new AwsClient({
		accessKeyId: config.accessKeyId,
		secretAccessKey: config.secretAccessKey,
		region: config.region,
		service: "s3",
	});
	const url = objectUrl(config.presignedEndpoint, config.bucket, objectKey);
	url.searchParams.set("X-Amz-Expires", String(60 * 60));
	const signedRequest = await client.sign(
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

function requireEnv(key: string) {
	const value = process.env[key]?.trim();

	if (!value) {
		throw new Error(`${key} is required`);
	}

	return value;
}
