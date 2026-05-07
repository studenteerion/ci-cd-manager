import { NextRequest, NextResponse } from 'next/server';
import { systemRestartWebhook } from '@/actions/teams';

export async function POST(request: NextRequest) {
  try {
    const result = await systemRestartWebhook();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error restarting webhook:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to restart webhook server' },
      { status: 500 }
    );
  }
}
