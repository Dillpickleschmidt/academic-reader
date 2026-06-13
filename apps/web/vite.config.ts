import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { defineConfig, loadEnv } from "vite";

import solidPlugin from "vite-plugin-solid";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, "../../", "");

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
					target: env.VITE_CONVEX_SITE_URL || "http://localhost:3211",
					changeOrigin: true,
				},
			},
		},
	};
});
