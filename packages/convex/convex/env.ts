export function requiredEnv(key: string) {
	const value = process.env[key]?.trim();

	if (!value) {
		throw new Error(`${key} is required`);
	}

	return value;
}
