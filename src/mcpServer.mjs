import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import { z } from "zod";

import {
  exportCodexConversations,
  listWorkedRepos,
} from "./codexExport.mjs";

const serverIconPath = new URL("../assets/codex-logo.png", import.meta.url);
const serverIconDataUri = `data:image/png;base64,${readFileSync(serverIconPath).toString("base64")}`;
const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const rawTranscriptInputSchema = {
  date: dateField.optional().describe("Single local date, YYYY-MM-DD."),
  start_date: dateField.optional().describe("Inclusive local start date, YYYY-MM-DD."),
  end_date: dateField.optional().describe("Inclusive local end date, YYYY-MM-DD."),
  timezone: z.string().optional().default("Europe/Paris"),
  repo: z.string().optional().describe("Optional repo name/path filter. If omitted, search all repos."),
  max_chars: z.number().int().positive().max(500000).optional().default(180000),
  codex_home: z.string().optional().describe("Codex home. Defaults to ~/.codex."),
  include_meta_conversations: z.boolean().optional().default(false).describe("Include retrospective/meta conversations such as status reports or summaries of previous days."),
  include_transitional_codex_messages: z.boolean().optional().default(false).describe("Include Codex progress updates. By default only user messages and Codex final answers are returned."),
};

const repoListInputSchema = {
  date: dateField.optional().describe("Single local date, YYYY-MM-DD."),
  start_date: dateField.optional().describe("Inclusive local start date, YYYY-MM-DD."),
  end_date: dateField.optional().describe("Inclusive local end date, YYYY-MM-DD."),
  timezone: z.string().optional().default("Europe/Paris"),
  repo: z.string().optional().describe("Optional repo name/path filter. If omitted, list all worked repos."),
  codex_home: z.string().optional().describe("Codex home. Defaults to ~/.codex."),
  include_transitional_codex_messages: z.boolean().optional().default(false).describe("Include Codex progress updates in message counts. By default only user messages and Codex final answers are counted."),
};

const localDateContextInputSchema = {
  timezone: z.string().optional().default("Europe/Paris"),
};

export const MCP_TOOL_CATALOG = [
  {
    name: "get_local_date_context",
    kind: "date_context",
    title: "Get local date context",
    description:
      "Return the current local date and time for a timezone such as Europe/Paris. Use this before interpreting relative requests like today, yesterday, or this week.",
  },
  {
    name: "get_raw_codex_conversations",
    kind: "raw_transcript",
    title: "Get raw Codex conversations",
    description:
      "Return local Codex conversations for one date or an inclusive date range, grouped by repo and conversation. By default it omits Codex progress updates and keeps only user messages plus Codex final answers. For requests like today or yesterday, call get_local_date_context first and then pass an exact YYYY-MM-DD date.",
  },
  {
    name: "list_worked_repos",
    kind: "repo_list",
    title: "List repos worked in Codex",
    description:
      "List repositories/workspaces where the user had Codex conversations during one date or an inclusive date range. Message counts omit Codex progress updates by default. For requests like today or yesterday, call get_local_date_context first and then pass an exact YYYY-MM-DD date.",
  },
];

export const MCP_SERVER_INFO = {
  name: "codex-work-context",
  title: "Codex Work Context",
  version: "0.1.0",
  description: "Daily Codex work context by repo and conversation.",
  icons: [{ src: serverIconDataUri, mimeType: "image/png" }],
};

export function createCodexWorkContextMcpServer() {
  const server = new McpServer(
    MCP_SERVER_INFO,
    { capabilities: { tools: {} } },
  );

  registerLocalDateContextTool(server, "get_local_date_context");
  registerRawTranscriptTool(server, "get_raw_codex_conversations");
  registerRepoListTool(server, "list_worked_repos");

  return server;
}

function registerLocalDateContextTool(server, name) {
  const tool = MCP_TOOL_CATALOG.find((entry) => entry.name === name);
  server.registerTool(
    name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: localDateContextInputSchema,
      annotations: readOnlyAnnotations,
    },
    async (args) => {
      const result = getLocalDateContext(args);
      return {
        content: [{ type: "text", text: result.text }],
        structuredContent: result,
      };
    },
  );
}

function registerRepoListTool(server, name) {
  const tool = MCP_TOOL_CATALOG.find((entry) => entry.name === name);
  server.registerTool(
    name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: repoListInputSchema,
      annotations: readOnlyAnnotations,
    },
    async (args) => {
      const result = await listWorkedRepos(args);
      return {
        content: [{ type: "text", text: result.text }],
        structuredContent: result,
      };
    },
  );
}

function registerRawTranscriptTool(server, name) {
  const tool = MCP_TOOL_CATALOG.find((entry) => entry.name === name);
  server.registerTool(
    name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: rawTranscriptInputSchema,
      annotations: readOnlyAnnotations,
    },
    async (args) => {
      const result = await exportCodexConversations({
        ...args,
        exclude_meta_conversations: !args.include_meta_conversations,
      });
      return {
        content: [{ type: "text", text: result.text }],
        structuredContent: {
          summary: result.summary,
          exportText: result.text,
        },
      };
    },
  );
}

export function createApp({ host = "127.0.0.1" } = {}) {
  const app = createMcpExpressApp({ host });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, name: "codex-work-context" });
  });

  app.post("/mcp", async (req, res) => {
    const server = createCodexWorkContextMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        transport.close();
        server.close();
      });
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", (_req, res) => {
    res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Use POST /mcp." }, id: null });
  });

  return app;
}

function getLocalDateContext(args = {}) {
  const timezone = args.timezone ?? "Europe/Paris";
  const now = DateTime.now().setZone(timezone);
  const today = now.toFormat("yyyy-MM-dd");
  const yesterday = now.minus({ days: 1 }).toFormat("yyyy-MM-dd");
  const startOfWeek = now.startOf("week").toFormat("yyyy-MM-dd");
  const endOfWeek = now.endOf("week").toFormat("yyyy-MM-dd");

  return {
    timezone,
    now_local: now.toFormat("yyyy-MM-dd HH:mm:ss"),
    today,
    yesterday,
    start_of_week: startOfWeek,
    end_of_week: endOfWeek,
    text: [
      "# Local date context",
      "",
      `Timezone: ${timezone}`,
      `Now: ${now.toFormat("yyyy-MM-dd HH:mm:ss")}`,
      `Today: ${today}`,
      `Yesterday: ${yesterday}`,
      `Start of week: ${startOfWeek}`,
      `End of week: ${endOfWeek}`,
    ].join("\n"),
  };
}
