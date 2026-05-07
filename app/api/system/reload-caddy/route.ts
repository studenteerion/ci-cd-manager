import { NextRequest, NextResponse } from 'next/server';
import { systemReloadCaddy } from '@/actions/teams';

export async function POST(request: NextRequest) {
  try {
    const result = await systemReloadCaddy();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error reloading Caddy:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to reload Caddy' },
      { status: 500 }
    );
  }
}
