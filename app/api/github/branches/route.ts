import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { fetchGitHubBranches, GitHubApiError } from '@/lib/github/service';

export async function POST(request: NextRequest) {
  const authCheck = await requireAuth(request);
  if (!authCheck.authenticated) {
    return authCheck.response!;
  }

  try {
    const { repositoryUrl } = (await request.json()) as { repositoryUrl?: string };
    if (!repositoryUrl) {
      return NextResponse.json(
        { success: false, branches: [], message: 'Repository URL is required.' },
        { status: 400 }
      );
    }

    console.info('[GitHub] Branch lookup started', { repositoryUrl });
    const result = await fetchGitHubBranches(repositoryUrl);
    console.info('[GitHub] Branch lookup success', {
      repositoryUrl,
      branches: result.branches.length,
      defaultBranch: result.defaultBranch,
      rateLimit: result.rateLimit,
    });

    return NextResponse.json({
      success: true,
      branches: result.branches,
      defaultBranch: result.defaultBranch,
      rateLimit: result.rateLimit,
    });
  } catch (error) {
    const err = error as Error;
    if (error instanceof GitHubApiError) {
      console.warn('[GitHub] Branch lookup failed', {
        status: error.status,
        message: error.message,
        rateLimit: error.rateLimit,
      });
      return NextResponse.json(
        {
          success: false,
          branches: [],
          message: error.message,
          rateLimit: error.rateLimit,
        },
        { status: error.status || 500 }
      );
    }

    console.error('[GitHub] Branch lookup error', err);
    return NextResponse.json(
      { success: false, branches: [], message: 'Failed to fetch GitHub branches.' },
      { status: 500 }
    );
  }
}
