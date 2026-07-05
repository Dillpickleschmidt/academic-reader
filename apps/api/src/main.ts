import { Hono } from "hono";
import { codexConnectionsRoute } from "./routes/codex-connections";
import { documentsRoute } from "./routes/documents";
import { processingEventsRoute } from "./routes/processing-events";
import { uploadsRoute } from "./routes/uploads";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/api/codex-connections", codexConnectionsRoute);
app.route("/api/documents", documentsRoute);
app.route("/api/processing-events", processingEventsRoute);
app.route("/api/uploads", uploadsRoute);

export default {
	port: Number(process.env.PORT ?? 8787),
	idleTimeout: 60,
	fetch: app.fetch,
};
