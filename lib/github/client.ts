import { parseGitHubRepoUrl } from './parse';

export interface BranchLookupResponse {
  success: boolean;
  branches: string[];
  defaultBranch?: string;
  message?: string;
  rateLimit?: {
    remaining: number | null;
    reset: number | null;
  };
}

export function isGitHubRepoUrl(value: string): boolean {
  return Boolean(parseGitHubRepoUrl(value));
}

export async function fetchGitHubBranches(
  repositoryUrl: string,
  options?: { signal?: AbortSignal }
): Promise<BranchLookupResponse> {
  const response = await fetch('/api/github/branches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repositoryUrl }),
    signal: options?.signal,
  });

  const data = (await response.json()) as BranchLookupResponse;
  if (!response.ok) {
    return {
      success: false,
      branches: [],
      message: data.message || 'Failed to fetch branches.',
      rateLimit: data.rateLimit,
    };
  }

  return data;
}
