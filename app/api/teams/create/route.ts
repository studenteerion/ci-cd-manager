import { NextRequest, NextResponse } from 'next/server';
import { createTeam, CreateTeamInput } from '@/actions/teams';
import { EnvEntry, recordToEnvEntries, validateEnvEntries } from '@/lib/env-file';
import { requireAuth } from '@/lib/auth/middleware';

export async function POST(request: NextRequest) {
  const authCheck = await requireAuth(request);
  if (!authCheck.authenticated) {
    return authCheck.response!;
  }
  if (authCheck.user?.role !== 'admin') {
    return NextResponse.json(
      { success: false, message: 'Operazione non autorizzata' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { teamName, repositoryUrl, domain, hostPort, branch, envVariables, envEntries } = body as CreateTeamInput;

    if (!teamName || /\s/.test(teamName)) {
      return NextResponse.json(
        { success: false, message: 'Il nome team non può contenere spazi.' },
        { status: 400 }
      );
    }

    if (!domain || /\s/.test(domain)) {
      return NextResponse.json(
        { success: false, message: 'Il dominio/subdomain non può contenere spazi.' },
        { status: 400 }
      );
    }

    const normalizedEntries = Array.isArray(envEntries)
      ? (envEntries as EnvEntry[])
      : recordToEnvEntries(envVariables || {});
    const validation = validateEnvEntries(normalizedEntries);
    if (validation.errors.length > 0) {
      return NextResponse.json(
        { success: false, message: `Invalid environment variables: ${validation.errors.join(' | ')}` },
        { status: 400 }
      );
    }

    const result = await createTeam({
      teamName,
      repositoryUrl,
      domain,
      hostPort,
      envVariables,
      envEntries: validation.entries,
      branch,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        webhookSecret: result.webhookSecret || result.message.split('secret: ')[1],
        hostPort: result.hostPort,
        teamPassword: result.teamPassword,
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
