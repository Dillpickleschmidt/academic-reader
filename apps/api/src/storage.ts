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
	const objectKey = `temporary-uploads/${temporaryUploadId}/${safeFilename(input.filename)}`;
	const uploadUrl = await getPresignedUploadUrl(config, objectKey, input.mimeType);

	return {
		temporaryUploadId,
		objectKey,
		uploadUrl,
		expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
		headers: {
			"Content-Type": input.mimeType,
		},
	};
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
