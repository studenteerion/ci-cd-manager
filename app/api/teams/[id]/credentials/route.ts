import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getUserByUsername, updateUserCredentials, generateRandomPassword } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  const user = await getUserByUsername(id);
  if (!user) {
    return NextResponse.json(
      { success: false, message: 'Credenziali team non trovate' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    username: user.username,
    password: user.password,
    status: user.status,
    role: user.role,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const manualPassword = typeof body.password === 'string' ? body.password.trim() : '';
  const generate = Boolean(body.generate);
  const status = typeof body.status === 'string' ? body.status.trim() : '';

  if (status && !['active', 'inactive'].includes(status)) {
    return NextResponse.json(
      { success: false, message: 'Stato account non valido' },
      { status: 400 }
    );
  }

  let password: string | undefined;
  if (generate) {
    password = generateRandomPassword(12);
  } else if (manualPassword) {
    password = manualPassword;
  }

  const updated = await updateUserCredentials(id, {
    ...(password ? { password } : {}),
    ...(status ? { status: status as 'active' | 'inactive' } : {}),
  });

  if (!updated) {
    return NextResponse.json(
      { success: false, message: 'Credenziali team non trovate' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    message: 'Credenziali aggiornate',
    password,
    status: updated.status,
  });
}
