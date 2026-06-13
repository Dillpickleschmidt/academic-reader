import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";
import { requiredEnv } from "./env";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, {
	cors: {
		allowedOrigins: [requiredEnv("SITE_URL")],
	},
});

export default http;
