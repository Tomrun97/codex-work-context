#!/usr/bin/env node

import { createApp } from "../src/mcpServer.mjs";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
const app = createApp({ host });

const server = app.listen(port, host, () => {
  console.log(`Codex work-context MCP server listening at http://${host}:${port}/mcp`);
});

server.on("error", (error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});
