import assert from "node:assert/strict";
import test from "node:test";

import { MCP_SERVER_INFO, MCP_TOOL_CATALOG } from "../src/mcpServer.mjs";

test("MCP catalog exposes canonical raw/repo tools plus local date context", () => {
  const names = MCP_TOOL_CATALOG.map((tool) => tool.name);

  assert.deepEqual(names, ["get_local_date_context", "get_raw_codex_conversations", "list_worked_repos"]);
  assert.ok(!names.includes("get_ai_work_summary"));
  assert.ok(!names.includes("get_work_context"));
  assert.ok(!names.includes("extract_codex_conversations"));
  assert.ok(!names.includes("list_sessions"));
  assert.ok(!names.includes("search_sessions"));
  assert.ok(!names.includes("get_session"));

  const dateTool = MCP_TOOL_CATALOG.find((tool) => tool.name === "get_local_date_context");
  const rawTool = MCP_TOOL_CATALOG.find((tool) => tool.name === "get_raw_codex_conversations");
  const repoTool = MCP_TOOL_CATALOG.find((tool) => tool.name === "list_worked_repos");
  assert.equal(dateTool.kind, "date_context");
  assert.equal(rawTool.kind, "raw_transcript");
  assert.equal(repoTool.kind, "repo_list");
  assert.ok(!MCP_TOOL_CATALOG.some((tool) => tool.kind === "ai_summary"));
  assert.ok(!MCP_TOOL_CATALOG.some((tool) => tool.kind.startsWith("session_")));
  assert.match(dateTool.description, /today|timezone|local/i);
  assert.match(rawTool.description, /final answers/i);
  assert.match(repoTool.description, /repositories/i);
});

test("MCP server metadata exposes a PNG icon", () => {
  assert.equal(MCP_SERVER_INFO.title, "Codex Work Context");
  assert.equal(MCP_SERVER_INFO.icons.length, 1);
  assert.equal(MCP_SERVER_INFO.icons[0].mimeType, "image/png");
  assert.match(MCP_SERVER_INFO.icons[0].src, /^data:image\/png;base64,/);
});
