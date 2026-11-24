import { serve } from "@hono/node-server";
import { createLocalApp } from "./local.js";

const port = Number(process.env.PORT ?? 8787);
const dataDir = process.env.GALLERY_DATA ?? "data";
const app = createLocalApp({ dataDir });
serve({ fetch: app.fetch, hostname: "127.0.0.1", port }, () => {
  console.log(`gallery api http://127.0.0.1:${port}`);
});
