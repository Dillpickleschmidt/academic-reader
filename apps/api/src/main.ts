import { Hono } from "hono";
import { uploadsRoute } from "./routes/uploads";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/api/uploads", uploadsRoute);

export default {
	port: Number(process.env.PORT ?? 8787),
	fetch: app.fetch,
};
