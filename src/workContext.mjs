import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { readCodexConversations } from "./codexReader.mjs";
import { dateWindow } from "./dateWindow.mjs";

const META_CONVERSATION_PATTERNS = [
  /fais moi un rapport/i,
  /fais-moi un rapport/i,
  /qu['’]est ce qu['’]on a fait/i,
  /qu['’]est ce que j['’]ai fait/i,
  /what did we do/i,
  /what did i do/i,
  /ou on en est/i,
  /où on en est/i,
  /\bresume\b/i,
  /\brésumé\b/i,
  /\bsummary\b/i,
];

export async function loadWorkContext(args = {}, { readConversations = readCodexConversations } = {}) {
  const window = dateWindow(args);
  const conversations = await readConversations({
    codex_home: args.codex_home,
    window,
    include_transitional_codex_messages: Boolean(args.include_transitional_codex_messages),
  });
  const filteredConversations = conversations
    .map((conversation) => ({ ...conversation, repo: resolveRepo(conversation.cwd) }))
    .filter((conversation) => !args.repo || matchesRepo(conversation.repo, args.repo))
    .filter((conversation) => !args.exclude_meta_conversations || !isMetaConversation(conversation));
  const repos = groupByRepo(filteredConversations);

  return {
    window,
    repos,
    conversations: filteredConversations,
    summary: buildSummary(window, repos, filteredConversations),
  };
}

export function buildWorkedRepoList(context) {
  return context.repos.map((repo) => {
    const messages = repo.conversations.flatMap((conversation) => conversation.messages);
    return {
      name: repo.name,
      path: repo.path,
      conversationCount: repo.conversations.length,
      messageCount: messages.length,
      firstActivity: messages[0]?.timestampLocal ?? null,
      lastActivity: messages.at(-1)?.timestampLocal ?? null,
    };
  });
}

function buildSummary(window, repos, conversations) {
  return {
    period: {
      start_date: window.start_date,
      end_date: window.end_date,
      timezone: window.timezone,
      startUtc: window.startUtc.toISO(),
      endUtcExclusive: window.endUtcExclusive.toISO(),
    },
    repoCount: repos.length,
    conversationCount: conversations.length,
    messageCount: conversations.reduce((sum, conversation) => sum + conversation.messages.length, 0),
  };
}

function isMetaConversation(conversation) {
  const openingUserText = conversation.messages
    .filter((message) => message.role === "user")
    .slice(0, 3)
    .map((message) => message.text)
    .join("\n");

  return META_CONVERSATION_PATTERNS.some((pattern) => pattern.test(openingUserText));
}

function groupByRepo(conversations) {
  const byPath = new Map();
  for (const conversation of conversations) {
    const repoPath = conversation.repo.path;
    if (!byPath.has(repoPath)) {
      byPath.set(repoPath, {
        name: conversation.repo.name,
        path: repoPath,
        conversations: [],
      });
    }
    byPath.get(repoPath).conversations.push(conversation);
  }

  return [...byPath.values()]
    .map((repo) => ({
      ...repo,
      conversations: repo.conversations.sort((a, b) =>
        a.messages[0].timestampUtc.localeCompare(b.messages[0].timestampUtc),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function resolveRepo(cwd) {
  let current = path.resolve(expandHome(cwd));
  while (true) {
    if (existsSync(path.join(current, ".git"))) {
      return { name: path.basename(current), path: current };
    }
    const parent = path.dirname(current);
    if (parent === current) {
      const resolved = path.resolve(expandHome(cwd));
      return { name: path.basename(resolved) || resolved, path: resolved };
    }
    current = parent;
  }
}

function matchesRepo(repo, filter) {
  const lower = filter.toLowerCase();
  return repo.name.toLowerCase().includes(lower) || repo.path.toLowerCase().includes(lower);
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
