import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DateTime } from "luxon";

const THREAD_ID_RE = /^rollout-.*-(?<id>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/;
const MESSAGE_TYPES = new Set(["user_message", "agent_message"]);

export async function readCodexConversations({ codex_home, window, include_transitional_codex_messages = false }) {
  const codexRoot = path.resolve(expandHome(codex_home ?? path.join(os.homedir(), ".codex")));
  const rolloutPaths = await findRolloutPaths(codexRoot);
  const conversations = [];

  for (const rolloutPath of rolloutPaths) {
    const conversation = await readConversation(rolloutPath, window, {
      include_transitional_codex_messages,
    });
    if (conversation.messages.length > 0) {
      conversations.push(conversation);
    }
  }

  return conversations;
}

async function findRolloutPaths(codexRoot) {
  const roots = [path.join(codexRoot, "sessions"), path.join(codexRoot, "archived_sessions")];
  const found = [];
  for (const root of roots) {
    found.push(...(await walkJsonl(root)));
  }
  return found.sort();
}

async function walkJsonl(root) {
  if (!existsSync(root)) {
    return [];
  }
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkJsonl(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(entryPath);
    }
  }
  return files;
}

async function readConversation(rolloutPath, window, options) {
  const text = await readFile(rolloutPath, "utf8");
  const threadId = threadIdFromPath(rolloutPath);
  const conversation = {
    id: threadId,
    title: threadId,
    cwd: path.dirname(rolloutPath),
    source: rolloutPath,
    messages: [],
  };
  let isForkedSession = false;
  let hasSessionMeta = false;
  let hasCurrentTurnStarted = false;

  for (const line of text.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const row = parseJsonlLine(line, rolloutPath);

    if (row.type === "session_meta") {
      if (hasSessionMeta) {
        continue;
      }
      conversation.id = row.payload.id;
      conversation.cwd = row.payload.cwd;
      isForkedSession = Boolean(row.payload.forked_from_id);
      hasSessionMeta = true;
      continue;
    }

    if (row.type !== "event_msg") {
      continue;
    }
    const payload = row.payload;
    if (payload.type === "task_started") {
      if (!isForkedSession || isCurrentTaskStarted(row, payload)) {
        hasCurrentTurnStarted = true;
      }
      continue;
    }
    if (isForkedSession && !hasCurrentTurnStarted) {
      continue;
    }
    if (payload.type === "thread_name_updated" && payload.thread_name) {
      conversation.title = payload.thread_name;
      continue;
    }
    if (!isExportedMessage(payload, options)) {
      continue;
    }

    const timestamp = DateTime.fromISO(row.timestamp, { zone: "utc" });
    if (!timestamp.isValid || timestamp < window.startUtc || timestamp >= window.endUtcExclusive) {
      continue;
    }

    conversation.messages.push({
      timestampUtc: timestamp.toISO(),
      timestampLocal: timestamp.setZone(window.timezone).toFormat("yyyy-MM-dd HH:mm:ss"),
      role: payload.type === "user_message" ? "user" : "codex",
      phase: payload.phase ?? "",
      text: payload.message,
    });
  }

  conversation.messages.sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc));
  return conversation;
}

function parseJsonlLine(line, rolloutPath) {
  try {
    return JSON.parse(line);
  } catch (error) {
    throw new Error(`Invalid Codex JSONL in ${rolloutPath}: ${error.message}`);
  }
}

function isExportedMessage(payload, options) {
  if (!MESSAGE_TYPES.has(payload.type)) {
    return false;
  }
  if (payload.type !== "agent_message") {
    return true;
  }
  return options.include_transitional_codex_messages || payload.phase === "final_answer";
}

function isCurrentTaskStarted(row, payload) {
  if (payload.started_at === undefined) {
    return false;
  }
  const timestamp = DateTime.fromISO(row.timestamp, { zone: "utc" });
  const startedAt = DateTime.fromSeconds(payload.started_at, { zone: "utc" });
  return timestamp.isValid && startedAt.isValid && Math.abs(timestamp.diff(startedAt, "seconds").seconds) < 5;
}

function threadIdFromPath(rolloutPath) {
  const match = THREAD_ID_RE.exec(path.basename(rolloutPath));
  return match?.groups?.id ?? path.basename(rolloutPath, ".jsonl");
}

function expandHome(value) {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}
