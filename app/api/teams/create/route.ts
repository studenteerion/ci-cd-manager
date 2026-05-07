import { NextRequest, NextResponse } from 'next/server';
import { createTeam, CreateTeamInput } from '@/actions/teams';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { teamName, repositoryUrl, domain, branch, envVariables } = body as CreateTeamInput;

    const result = await createTeam({
      teamName,
      repositoryUrl,
      domain,
      envVariables,
      branch,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        webhookSecret: result.message.split('secret: ')[1],
      });
    } else {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Team creation error:', error);
    return NextResponse.json(
      { success: false, message: 'An error occurred during team creation' },
      { status: 500 }
    );
  }
}
