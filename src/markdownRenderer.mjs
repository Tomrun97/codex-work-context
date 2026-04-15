export const DEFAULT_MAX_CHARS = 180000;

export function renderTranscriptMarkdown({ repos, summary }) {
  const lines = [
    "# Codex work transcript export",
    "",
    `Period: ${summary.period.start_date} -> ${summary.period.end_date}`,
    `Timezone: ${summary.period.timezone}`,
    `Repos: ${summary.repoCount}`,
    `Conversations: ${summary.conversationCount}`,
    `Messages: ${summary.messageCount}`,
    "",
  ];

  for (const repo of repos) {
    lines.push(`## ${repo.name}`, "", `Path: \`${repo.path}\``, `Conversations: ${repo.conversations.length}`, "");
    repo.conversations.forEach((conversation, index) => {
      lines.push(
        `### Conversation ${index + 1}: ${conversation.title}`,
        "",
        `Thread: ${conversation.id}`,
        `Workspace cwd: ${conversation.cwd}`,
        `Source: ${conversation.source}`,
        "",
      );
      for (const message of conversation.messages) {
        const role = message.role === "user" ? "USER" : "CODEX";
        const phase = message.phase ? ` (${message.phase})` : "";
        lines.push(`#### ${message.timestampLocal} - ${role}${phase}`, "", message.text, "");
      }
    });
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderWorkedReposMarkdown({ period, repos }) {
  const header = [
    "# Repos worked in Codex",
    "",
    `Period: ${period.start_date} -> ${period.end_date}`,
    `Timezone: ${period.timezone}`,
    `Repos: ${repos.length}`,
  ].join("\n");
  const sections = repos.map((repo) =>
    [
      `## ${repo.name}`,
      "",
      `Path: \`${repo.path}\``,
      `Conversations: ${repo.conversationCount}`,
      `Messages: ${repo.messageCount}`,
      `First activity: ${repo.firstActivity ?? "n/a"}`,
      `Last activity: ${repo.lastActivity ?? "n/a"}`,
    ].join("\n"),
  );

  return `${[header, ...sections].join("\n\n").trimEnd()}\n`;
}

export function truncate(text, max_chars = DEFAULT_MAX_CHARS) {
  if (!max_chars || text.length <= max_chars) {
    return { text, truncated: false };
  }
  return {
    text: `${text.slice(0, max_chars)}\n\n[Truncated to ${max_chars} characters. Save to a file or raise max_chars for the full export.]\n`,
    truncated: true,
  };
}
