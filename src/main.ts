import { Hono } from "@hono/hono";
import { createAuthMiddleware, createAuthRoutes } from "./auth.ts";
import { registerCrons } from "./crons.ts";
import { createRoutes } from "./routes.ts";
import { createAppContext } from "./services/app_context.ts";

const app = new Hono();
const context = createAppContext();

app.route("/", createAuthRoutes(context.storage));
app.use("*", createAuthMiddleware(context.storage));
app.route("/", createRoutes(context));
registerCrons(context);

Deno.serve({ port: context.config.port }, app.fetch);
