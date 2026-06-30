import { Hono } from "@hono/hono";
import { registerCrons } from "./crons.ts";
import { createRoutes } from "./routes.ts";
import { createAppContext } from "./services/app_context.ts";

const app = new Hono();
const context = createAppContext();

app.route("/", createRoutes(context));
registerCrons(context);

Deno.serve({ port: context.config.port }, app.fetch);
