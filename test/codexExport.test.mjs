import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  exportCodexConversations,
  listWorkedRepos,
  normalizeDateArgs,
} from "../src/codexExport.mjs";

async function writeJsonl(filePath, rows) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

test("normalizeDateArgs accepts either one date or an inclusive range", () => {
  assert.deepEqual(normalizeDateArgs({ date: "2026-04-28" }), {
    start_date: "2026-04-28",
    end_date: "2026-04-28",
    timezone: "Europe/Paris",
  });
  assert.deepEqual(normalizeDateArgs({ start_date: "2026-04-20", end_date: "2026-04-26", timezone: "UTC" }), {
    start_date: "2026-04-20",
    end_date: "2026-04-26",
    timezone: "UTC",
  });
  assert.throws(() => normalizeDateArgs({ date: "2026-04-28", start_date: "2026-04-20", end_date: "2026-04-26" }), /either date or start/);
  assert.throws(() => normalizeDateArgs({ startDate: "2026-04-20", endDate: "2026-04-26" }), /date or a start_date/);
});

test("exportCodexConversations groups local Codex messages by repo then conversation", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "cwc-export-"));
  const codexHome = path.join(tmp, ".codex");
  const repo = path.join(tmp, "repo-a");
  await mkdir(path.join(repo, ".git"), { recursive: true });

  await writeJsonl(path.join(codexHome, "sessions/2026/04/28/rollout-2026-04-28T09-00-00-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl"), [
    { type: "session_meta", payload: { id: "thread-a", cwd: repo } },
    { timestamp: "2026-04-28T07:00:00.000Z", type: "event_msg", payload: { type: "thread_name_updated", thread_name: "Fix billing" } },
    { timestamp: "2026-04-28T07:01:00.000Z", type: "event_msg", payload: { type: "user_message", message: "Corrige le bug de facture" } },
    { timestamp: "2026-04-28T07:05:00.000Z", type: "event_msg", payload: { type: "agent_message", phase: "final_answer", message: "Bug corrige et test ajoute." } },
  ]);

  await writeJsonl(path.join(codexHome, "sessions/2026/04/29/rollout-2026-04-29T09-00-00-ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl"), [
    { type: "session_meta", payload: { id: "thread-b", cwd: repo } },
    { timestamp: "2026-04-29T07:01:00.000Z", type: "event_msg", payload: { type: "user_message", message: "Message hors fenetre" } },
  ]);

  const result = await exportCodexConversations({
    date: "2026-04-28",
    timezone: "Europe/Paris",
    codex_home: codexHome,
  });

  assert.equal(result.summary.repoCount, 1);
  assert.equal(result.summary.conversationCount, 1);
  assert.equal(result.summary.messageCount, 2);
  assert.equal(result.repos[0].name, "repo-a");
  assert.equal(result.repos[0].conversations[0].title, "Fix billing");
  assert.match(result.markdown, /Corrige le bug de facture/);
  assert.doesNotMatch(result.markdown, /Message hors fenetre/);
});

test("repo parameter filters raw exports and listWorkedRepos lists every touched repo when omitted", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "cwc-repos-"));
  const codexHome = path.join(tmp, ".codex");
  const repoA = path.join(tmp, "repo-a");
  const repoB = path.join(tmp, "repo-b");
  await mkdir(path.join(repoA, ".git"), { recursive: true });
  await mkdir(path.join(repoB, ".git"), { recursive: true });

  await writeJsonl(path.join(codexHome, "sessions/2026/04/28/rollout-2026-04-28T09-00-00-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl"), [
    { type: "session_meta", payload: { id: "thread-a", cwd: repoA } },
    { timestamp: "2026-04-28T07:01:00.000Z", type: "event_msg", payload: { type: "user_message", message: "Travail repo A" } },
    { timestamp: "2026-04-28T07:02:00.000Z", type: "event_msg", payload: { type: "agent_message", message: "Resultat A" } },
  ]);
  await writeJsonl(path.join(codexHome, "sessions/2026/04/28/rollout-2026-04-28T10-00-00-ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl"), [
    { type: "session_meta", payload: { id: "thread-b", cwd: repoB } },
    { timestamp: "2026-04-28T08:01:00.000Z", type: "event_msg", payload: { type: "user_message", message: "Travail repo B" } },
  ]);

  const unwantedExportPath = path.join(tmp, "should-not-be-written.md");
  const allRepos = await listWorkedRepos({
    date: "2026-04-28",
    timezone: "Europe/Paris",
    codex_home: codexHome,
    output_path: unwantedExportPath,
  });
  assert.deepEqual(allRepos.repos.map((repo) => repo.name), ["repo-a", "repo-b"]);
  assert.equal(allRepos.summary.repoCount, 2);
  assert.equal(existsSync(unwantedExportPath), false);

  const rawRepoB = await exportCodexConversations({
    date: "2026-04-28",
    timezone: "Europe/Paris",
    codex_home: codexHome,
    repo: "repo-b",
  });
  assert.equal(rawRepoB.summary.repoCount, 1);
  assert.equal(rawRepoB.repos[0].name, "repo-b");
  assert.match(rawRepoB.markdown, /Travail repo B/);
  assert.doesNotMatch(rawRepoB.markdown, /Travail repo A/);
});

test("exportCodexConversations can exclude retrospective meta conversations from the same day", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "cwc-meta-"));
  const codexHome = path.join(tmp, ".codex");
  const repo = path.join(tmp, "repo-a");
  await mkdir(path.join(repo, ".git"), { recursive: true });

  await writeJsonl(path.join(codexHome, "sessions/2026/04/28/rollout-2026-04-28T09-00-00-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl"), [
    { type: "session_meta", payload: { id: "thread-work", cwd: repo } },
    { timestamp: "2026-04-28T07:01:00.000Z", type: "event_msg", payload: { type: "user_message", message: "Corrige le bug de facture" } },
    { timestamp: "2026-04-28T07:02:00.000Z", type: "event_msg", payload: { type: "agent_message", message: "Bug corrige." } },
  ]);

  await writeJsonl(path.join(codexHome, "sessions/2026/04/28/rollout-2026-04-28T10-00-00-bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl"), [
    { type: "session_meta", payload: { id: "thread-meta", cwd: repo } },
    { timestamp: "2026-04-28T08:01:00.000Z", type: "event_msg", payload: { type: "user_message", message: "Fais moi un rapport de tout ce qu'on a fait et où on en est" } },
    { timestamp: "2026-04-28T08:02:00.000Z", type: "event_msg", payload: { type: "agent_message", message: "Hier on a fait beaucoup de travail sur le repo." } },
  ]);

  const raw = await exportCodexConversations({
    date: "2026-04-28",
    timezone: "Europe/Paris",
    codex_home: codexHome,
  });
  assert.equal(raw.summary.conversationCount, 2);
  assert.match(raw.markdown, /rapport de tout ce qu'on a fait/i);

  const filtered = await exportCodexConversations({
    date: "2026-04-28",
    timezone: "Europe/Paris",
    codex_home: codexHome,
    exclude_meta_conversations: true,
  });
  assert.equal(filtered.summary.conversationCount, 1);
  assert.match(filtered.markdown, /Corrige le bug de facture/);
  assert.doesNotMatch(filtered.markdown, /rapport de tout ce qu'on a fait/i);
  assert.doesNotMatch(filtered.markdown, /Hier on a fait beaucoup/i);
});

test("exportCodexConversations ignores replayed history before task_started in forked sessions", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "cwc-fork-"));
  const codexHome = path.join(tmp, ".codex");
  const repo = path.join(tmp, "repo-a");
  await mkdir(path.join(repo, ".git"), { recursive: true });

  await writeJsonl(path.join(codexHome, "sessions/2026/04/28/rollout-2026-04-28T13-00-00-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl"), [
    { type: "session_meta", payload: { id: "thread-fork", forked_from_id: "thread-yesterday", cwd: repo } },
    { type: "session_meta", payload: { id: "thread-yesterday", cwd: repo } },
    { timestamp: "2026-04-28T11:00:00.000Z", type: "event_msg", payload: { type: "task_started", started_at: 1777287600 } },
    { timestamp: "2026-04-28T11:00:00.000Z", type: "event_msg", payload: { type: "user_message", message: "Make the desktop app work on macOS" } },
    { timestamp: "2026-04-28T11:00:00.000Z", type: "event_msg", payload: { type: "agent_message", message: "I added the macOS runtime." } },
    { timestamp: "2026-04-28T11:01:00.000Z", type: "event_msg", payload: { type: "task_started", started_at: 1777374060 } },
    { timestamp: "2026-04-28T11:02:00.000Z", type: "event_msg", payload: { type: "user_message", message: "Unlock the report dashboard" } },
    { timestamp: "2026-04-28T11:03:00.000Z", type: "event_msg", payload: { type: "agent_message", phase: "final_answer", message: "Report dashboard unlocked." } },
  ]);

  const result = await exportCodexConversations({
    date: "2026-04-28",
    timezone: "Europe/Paris",
    codex_home: codexHome,
  });

  assert.equal(result.summary.messageCount, 2);
  assert.match(result.markdown, /Unlock the report dashboard/);
  assert.doesNotMatch(result.markdown, /desktop app work on macOS/);
  assert.doesNotMatch(result.markdown, /macOS runtime/);
});

test("exportCodexConversations excludes transitional Codex messages unless explicitly included", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "cwc-final-only-"));
  const codexHome = path.join(tmp, ".codex");
  const repo = path.join(tmp, "repo-a");
  await mkdir(path.join(repo, ".git"), { recursive: true });

  await writeJsonl(path.join(codexHome, "sessions/2026/04/28/rollout-2026-04-28T09-00-00-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl"), [
    { type: "session_meta", payload: { id: "thread-a", cwd: repo } },
    { timestamp: "2026-04-28T07:01:00.000Z", type: "event_msg", payload: { type: "user_message", message: "Corrige le bug de facture" } },
    { timestamp: "2026-04-28T07:02:00.000Z", type: "event_msg", payload: { type: "agent_message", message: "Je vais regarder les tests." } },
    { timestamp: "2026-04-28T07:05:00.000Z", type: "event_msg", payload: { type: "agent_message", phase: "final_answer", message: "Bug corrige et test ajoute." } },
  ]);

  const filtered = await exportCodexConversations({
    date: "2026-04-28",
    timezone: "Europe/Paris",
    codex_home: codexHome,
  });
  assert.equal(filtered.summary.messageCount, 2);
  assert.match(filtered.markdown, /Corrige le bug de facture/);
  assert.match(filtered.markdown, /Bug corrige et test ajoute/);
  assert.doesNotMatch(filtered.markdown, /Je vais regarder les tests/);

  const full = await exportCodexConversations({
    date: "2026-04-28",
    timezone: "Europe/Paris",
    codex_home: codexHome,
    include_transitional_codex_messages: true,
  });
  assert.equal(full.summary.messageCount, 3);
  assert.match(full.markdown, /Je vais regarder les tests/);
});
