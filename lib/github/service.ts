import { parseGitHubRepoUrl } from './parse';

export interface GitHubRateLimit {
  remaining: number | null;
  reset: number | null;
}

export interface GitHubBranchLookup {
  branches: string[];
  defaultBranch?: string;
  rateLimit: GitHubRateLimit;
}

export class GitHubApiError extends Error {
  status: number;
  rateLimit: GitHubRateLimit;

  constructor(message: string, status: number, rateLimit: GitHubRateLimit) {
    super(message);
    this.status = status;
    this.rateLimit = rateLimit;
  }
}

const parseRateLimit = (headers: Headers): GitHubRateLimit => {
  const remaining = headers.get('x-ratelimit-remaining');
  const reset = headers.get('x-ratelimit-reset');
  return {
    remaining: remaining ? Number(remaining) : null,
    reset: reset ? Number(reset) : null,
  };
};

const buildHeaders = () => {
  const headers = new Headers({
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  });
  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_ACCESS_TOKEN;
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
};

const normalizeGitHubError = (status: number, message: string, rateLimit: GitHubRateLimit) => {
  if (status === 404) {
    return new GitHubApiError('Repository not found or access denied.', status, rateLimit);
  }
  if (status === 401) {
    return new GitHubApiError('Unauthorized to access this repository.', status, rateLimit);
  }
  if (status === 403 && rateLimit.remaining === 0) {
    return new GitHubApiError('GitHub rate limit reached. Please try again later.', status, rateLimit);
  }
  return new GitHubApiError(message || 'Unable to fetch repository branches.', status, rateLimit);
};

export async function fetchGitHubBranches(repoUrl: string): Promise<GitHubBranchLookup> {
  const repoInfo = parseGitHubRepoUrl(repoUrl);
  if (!repoInfo) {
    throw new GitHubApiError('Repository URL is not a valid GitHub URL.', 400, {
      remaining: null,
      reset: null,
    });
  }

  const { owner, repo } = repoInfo;
  const headers = buildHeaders();

  const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers,
    cache: 'no-store',
  });
  const repoRateLimit = parseRateLimit(repoResponse.headers);
  if (!repoResponse.ok) {
    const repoText = await repoResponse.text();
    throw normalizeGitHubError(repoResponse.status, repoText, repoRateLimit);
  }

  const repoPayload = (await repoResponse.json()) as { default_branch?: string };
  const branchesResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`,
    { headers, cache: 'no-store' }
  );
  const branchRateLimit = parseRateLimit(branchesResponse.headers);
  if (!branchesResponse.ok) {
    const branchText = await branchesResponse.text();
    throw normalizeGitHubError(branchesResponse.status, branchText, branchRateLimit);
  }

  const branchPayload = (await branchesResponse.json()) as Array<{ name: string }>;
  const branches = branchPayload.map((branch) => branch.name).filter(Boolean);

  return {
    branches,
    defaultBranch: repoPayload.default_branch,
    rateLimit: branchRateLimit,
  };
}
