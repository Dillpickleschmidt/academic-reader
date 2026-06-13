import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { defineConfig, loadEnv } from "vite";

import solidPlugin from "vite-plugin-solid";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, "../../", "");
	const convexSiteUrl = env.VITE_CONVEX_SITE_URL;

	if (!convexSiteUrl) {
		throw new Error("VITE_CONVEX_SITE_URL is required");
	}

	return {
		envDir: "../../",
		resolve: { tsconfigPaths: true },
		plugins: [
			devtools(),
			tailwindcss(),
			tanstackRouter({ target: "solid", autoCodeSplitting: true }),
			solidPlugin(),
		],
		server: {
			proxy: {
				"/api/auth": {
					target: convexSiteUrl,
					changeOrigin: true,
				},
				"/api": {
					target: "http://localhost:8787",
					changeOrigin: true,
				},
			},
		},
	};
});
