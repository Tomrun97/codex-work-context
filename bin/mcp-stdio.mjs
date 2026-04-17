#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createCodexWorkContextMcpServer } from "../src/mcpServer.mjs";

const server = createCodexWorkContextMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
