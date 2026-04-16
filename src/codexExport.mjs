import { buildWorkedRepoList, loadWorkContext } from "./workContext.mjs";
import {
  DEFAULT_MAX_CHARS,
  renderTranscriptMarkdown,
  renderWorkedReposMarkdown,
  truncate,
} from "./markdownRenderer.mjs";
import { dateWindow, normalizeDateArgs } from "./dateWindow.mjs";

export { dateWindow, normalizeDateArgs, truncate };

export async function exportCodexConversations(args = {}) {
  const context = await loadWorkContext(args);
  const markdown = renderTranscriptMarkdown(context);
  const truncated = truncate(markdown, Number(args.max_chars ?? DEFAULT_MAX_CHARS));

  return {
    summary: { ...context.summary, truncated: truncated.truncated },
    repos: context.repos,
    markdown,
    text: truncated.text,
    truncated: truncated.truncated,
  };
}

export async function listWorkedRepos(args = {}) {
  const context = await loadWorkContext(args);
  const repos = buildWorkedRepoList(context);
  const text = renderWorkedReposMarkdown({ period: context.window, repos });

  return {
    summary: {
      ...context.summary,
      repoCount: repos.length,
      messageCount: repos.reduce((sum, repo) => sum + repo.messageCount, 0),
    },
    repos,
    text,
  };
}
