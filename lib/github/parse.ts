export interface GitHubRepoInfo {
  owner: string;
  repo: string;
}

export function parseGitHubRepoUrl(input: string): GitHubRepoInfo | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname !== 'github.com') return null;
    const path = url.pathname.replace(/^\/+|\/+$/g, '');
    const [owner, repoRaw] = path.split('/');
    if (!owner || !repoRaw) return null;
    const repo = repoRaw.replace(/\.git$/i, '');
    return { owner, repo };
  } catch {
    return null;
  }
}
