import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { fetchGitHubCommits, GitHubApiError } from '@/lib/github/service';

export async function POST(request: NextRequest) {
  const authCheck = await requireAuth(request);
  if (!authCheck.authenticated) {
    return authCheck.response!;
  }

  try {
    const { repositoryUrl, branch, limit } = (await request.json()) as {
      repositoryUrl?: string;
      branch?: string;
      limit?: number;
    };
    if (!repositoryUrl) {
      return NextResponse.json(
        { success: false, commits: [], message: 'Repository URL is required.' },
        { status: 400 }
      );
    }
    if (!branch) {
      return NextResponse.json(
        { success: false, commits: [], message: 'Branch name is required.' },
        { status: 400 }
      );
    }

    console.info('[GitHub] Commit lookup started', { repositoryUrl, branch });
    const result = await fetchGitHubCommits(repositoryUrl, branch, limit);
    console.info('[GitHub] Commit lookup success', {
      repositoryUrl,
      branch,
      commits: result.commits.length,
      rateLimit: result.rateLimit,
    });

    return NextResponse.json({
      success: true,
      commits: result.commits,
      rateLimit: result.rateLimit,
    });
  } catch (error) {
    const err = error as Error;
    if (error instanceof GitHubApiError) {
      console.warn('[GitHub] Commit lookup failed', {
        status: error.status,
        message: error.message,
        rateLimit: error.rateLimit,
      });
      return NextResponse.json(
        {
          success: false,
          commits: [],
          message: error.message,
          rateLimit: error.rateLimit,
        },
        { status: error.status || 500 }
      );
    }

    console.error('[GitHub] Commit lookup error', err);
    return NextResponse.json(
      { success: false, commits: [], message: 'Failed to fetch GitHub commits.' },
      { status: 500 }
    );
  }
}
