#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { exportCodexConversations, listWorkedRepos } from "../src/codexExport.mjs";

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = command === "--help" || command === "-h" ? { help: true } : { command };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--date") args.date = rest[++index];
    else if (arg === "--start-date") args.start_date = rest[++index];
    else if (arg === "--end-date") args.end_date = rest[++index];
    else if (arg === "--timezone") args.timezone = rest[++index];
    else if (arg === "--codex-home") args.codex_home = rest[++index];
    else if (arg === "--repo") args.repo = rest[++index];
    else if (arg === "--output") args.output_path = path.resolve(rest[++index]);
    else if (arg === "--max-chars") args.max_chars = Number(rest[++index]);
    else if (arg === "--include-transitional-codex-messages") args.include_transitional_codex_messages = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  codex-work-context export --date YYYY-MM-DD [--output export.md]
  codex-work-context list-repos --date YYYY-MM-DD

Options:
  --timezone TZ             IANA timezone, default Europe/Paris
  --codex-home PATH         Codex home, default ~/.codex
  --repo TEXT               Limit to repo name/path containing TEXT
  --max-chars N             Max returned chars for export
  --include-transitional-codex-messages
                           Include Codex progress updates in export/list counts
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command || args.help) {
    printHelp();
    return;
  }

  if (args.command === "export") {
    const result = await exportCodexConversations({
      date: args.date,
      start_date: args.start_date,
      end_date: args.end_date,
      timezone: args.timezone,
      codex_home: args.codex_home,
      repo: args.repo,
      output_path: args.output_path,
      max_chars: args.max_chars,
      include_transitional_codex_messages: args.include_transitional_codex_messages,
    });
    if (args.output_path) {
      await mkdir(path.dirname(args.output_path), { recursive: true });
      await writeFile(args.output_path, result.markdown, "utf8");
    }
    console.log(args.output_path ? args.output_path : result.text);
    return;
  }

  if (args.command === "list-repos") {
    const result = await listWorkedRepos({
      date: args.date,
      start_date: args.start_date,
      end_date: args.end_date,
      timezone: args.timezone,
      codex_home: args.codex_home,
      repo: args.repo,
      include_transitional_codex_messages: args.include_transitional_codex_messages,
    });
    console.log(result.text);
    return;
  }

  throw new Error(`Unknown command: ${args.command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
