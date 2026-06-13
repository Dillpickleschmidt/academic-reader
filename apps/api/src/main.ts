import { Hono } from "hono";
import { processingEventsRoute } from "./routes/processing-events";
import { sourceDocumentsRoute } from "./routes/source-documents";
import { uploadsRoute } from "./routes/uploads";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/api/processing-events", processingEventsRoute);
app.route("/api/source-documents", sourceDocumentsRoute);
app.route("/api/uploads", uploadsRoute);

export default {
	port: Number(process.env.PORT ?? 8787),
	idleTimeout: 60,
	fetch: app.fetch,
};
