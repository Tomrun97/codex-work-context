# Codex Work Context

Codex Work Context is a small local CLI and MCP server that turns your local Codex session history into useful work context.

It answers questions like:

- Which repositories did I work on yesterday?
- What did I do in a specific repo last week?
- Can I export the raw Codex conversations for a given date range?
- Can an MCP client retrieve this context without reading my whole machine?

The project is read-only. It does not call OpenAI APIs, does not summarize with a model, and does not write back into your Codex data.

## Features

- Reads local Codex JSONL sessions from `~/.codex/sessions` and `~/.codex/archived_sessions`.
- Filters conversations by local date or inclusive date range.
- Groups activity by Git repository or workspace.
- Handles forked sessions without replaying copied history from the parent thread.
- Omits retrospective/meta conversations by default when used through the raw MCP export.
- Omits transitional Codex progress messages by default, keeping user messages and final answers.
- Provides both a command-line interface and a read-only MCP server.
- Supports HTTP MCP clients and stdio MCP clients.

## How It Works

Codex stores local sessions as JSONL files under your Codex home directory. This tool scans those files, extracts user messages and Codex final answers inside a requested local date window, resolves each conversation to the closest Git repository, then renders the result as Markdown or MCP structured content.

The main data flow is:

```text
~/.codex JSONL sessions
        |
        v
src/codexReader.mjs
        |
        v
date filtering + fork handling
        |
        v
src/workContext.mjs
        |
        v
repo grouping + optional repo filter
        |
        v
CLI Markdown output or MCP tool response
```

## Requirements

- Node.js 18 or newer
- npm
- A local Codex installation with session files under `~/.codex`

## Install

Clone the repository, then install dependencies:

```bash
git clone https://github.com/Tomrun974/codex-work-context.git
cd codex-work-context
npm install
```

## Quickstart

List the repositories you worked in on one day:

```bash
node bin/codex-work-context.mjs list-repos --date 2026-04-28
```

Export conversations for one day:

```bash
node bin/codex-work-context.mjs export --date 2026-04-28
```

Export a date range:

```bash
node bin/codex-work-context.mjs export \
  --start-date 2026-04-20 \
  --end-date 2026-04-26
```

Filter to one repository:

```bash
node bin/codex-work-context.mjs export \
  --date 2026-04-28 \
  --repo example-api
```

Save an export to a Markdown file:

```bash
node bin/codex-work-context.mjs export \
  --date 2026-04-28 \
  --output exports/2026-04-28.md
```

Use another Codex home directory:

```bash
node bin/codex-work-context.mjs list-repos \
  --date 2026-04-28 \
  --codex-home /path/to/.codex
```

By default, exports include user messages and Codex final answers only. To include Codex progress updates:

```bash
node bin/codex-work-context.mjs export \
  --date 2026-04-28 \
  --include-transitional-codex-messages
```

## CLI Reference

```text
codex-work-context export --date YYYY-MM-DD [options]
codex-work-context export --start-date YYYY-MM-DD --end-date YYYY-MM-DD [options]
codex-work-context list-repos --date YYYY-MM-DD [options]
codex-work-context list-repos --start-date YYYY-MM-DD --end-date YYYY-MM-DD [options]
```

Options:

| Option | Description |
| --- | --- |
| `--date YYYY-MM-DD` | Export or list activity for one local date. |
| `--start-date YYYY-MM-DD` | Inclusive start date for a range. |
| `--end-date YYYY-MM-DD` | Inclusive end date for a range. |
| `--timezone TZ` | IANA timezone. Defaults to `Europe/Paris`. |
| `--repo TEXT` | Keep only repos whose name or path contains the filter text. |
| `--codex-home PATH` | Codex home directory. Defaults to `~/.codex`. |
| `--max-chars N` | Truncate CLI export output to `N` characters. |
| `--output PATH` | Write the full Markdown export to a file. |
| `--include-transitional-codex-messages` | Include Codex progress messages, not only final answers. |

## Run As An MCP Server

### HTTP transport

Start the local HTTP server:

```bash
npm start
```

The server listens on:

```text
http://127.0.0.1:8787/mcp
```

Use a different port:

```bash
PORT=8788 npm start
```

By default, the server binds to `127.0.0.1`. To expose it on another interface intentionally:

```bash
HOST=0.0.0.0 PORT=8788 npm start
```

### Public tunnel

If your MCP client needs an HTTPS URL, you can create a tunnel:

```bash
cloudflared tunnel --url http://localhost:8788
```

Then configure the MCP client with the public HTTPS URL ending in `/mcp`.

Only do this when you understand the privacy implications. The server can expose local prompts, repo paths, and unfinished work.

### Stdio transport

For MCP clients that support stdio servers:

```bash
node bin/mcp-stdio.mjs
```

Example stdio command configuration:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/codex-work-context/bin/mcp-stdio.mjs"]
}
```

## MCP Tools

The MCP server exposes three read-only tools.

| Tool | Purpose |
| --- | --- |
| `get_local_date_context` | Returns local date context for a timezone: now, today, yesterday, start of week, and end of week. |
| `list_worked_repos` | Lists repos/workspaces with Codex activity during a date or date range. |
| `get_raw_codex_conversations` | Returns grouped Codex conversations for a date or date range. |

### `get_local_date_context`

Use this before interpreting relative dates such as "today", "yesterday", or "this week".

Input:

```json
{
  "timezone": "Europe/Paris"
}
```

### `list_worked_repos`

Input:

```json
{
  "date": "2026-04-28",
  "timezone": "Europe/Paris",
  "repo": "optional-name-or-path-filter",
  "codex_home": "~/.codex",
  "include_transitional_codex_messages": false
}
```

You can also use `start_date` and `end_date` instead of `date`.

### `get_raw_codex_conversations`

Input:

```json
{
  "start_date": "2026-04-20",
  "end_date": "2026-04-26",
  "timezone": "Europe/Paris",
  "repo": "optional-name-or-path-filter",
  "max_chars": 180000,
  "codex_home": "~/.codex",
  "include_meta_conversations": false,
  "include_transitional_codex_messages": false
}
```

## Project Layout

```text
.
├── bin/
│   ├── codex-work-context.mjs  # CLI entrypoint
│   ├── mcp-server.mjs          # HTTP MCP server entrypoint
│   └── mcp-stdio.mjs           # stdio MCP server entrypoint
├── src/
│   ├── codexExport.mjs         # Public facade for CLI and MCP callers
│   ├── codexReader.mjs         # Codex JSONL filesystem reader and parser
│   ├── dateWindow.mjs          # Date/range normalization
│   ├── markdownRenderer.mjs    # Markdown rendering and truncation
│   ├── mcpServer.mjs           # MCP tool registration and HTTP app
│   └── workContext.mjs         # Repo grouping and conversation filtering
├── test/
│   ├── codexExport.test.mjs
│   └── mcpTools.test.mjs
├── assets/
│   └── codex-logo.png
└── README.md
```

## Privacy And Security

This tool reads local Codex conversations. Those conversations may contain:

- prompts
- repository paths
- debugging context
- copied code snippets
- unfinished work
- private notes

The MCP server is read-only, but it can still expose sensitive local content to whichever client can reach it.

Recommended precautions:

- Keep the HTTP server bound to `127.0.0.1` unless you intentionally expose it.
- Do not run it on a public network without authentication or access controls in front of it.
- Be careful with tunnels such as `cloudflared`.
- Review exports before sharing them.
- Keep `.env`, logs, exports, and runtime databases out of Git.

## Development

Run tests:

```bash
npm test
```

Run a dependency audit:

```bash
npm audit --audit-level=moderate
```

Check the CLI help:

```bash
node bin/codex-work-context.mjs --help
```

## Troubleshooting

### No conversations are returned

Check that your Codex home exists and contains session files:

```bash
ls ~/.codex/sessions
```

If your Codex data is stored elsewhere, pass `--codex-home`.

### Relative dates are ambiguous

The CLI expects exact dates in `YYYY-MM-DD` format. MCP clients should call `get_local_date_context` before converting relative requests like "today" or "yesterday" into exact dates.

### Output is truncated

Increase `--max-chars` or write the full export to a file with `--output`.

### The HTTP server should only be local

That is the default:

```text
127.0.0.1:8787
```

Set `HOST=0.0.0.0` only when you intentionally want other machines or a tunnel to reach it.

## License

MIT
