import { NextResponse } from 'next/server';
import { publishMessage } from '@/lib/redis/client';
import { ChatMessage } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { channel, message } = body;
    
    if (!channel || !message) {
      return NextResponse.json(
        { error: '채널과 메시지는 필수입니다.' },
        { status: 400 }
      );
    }
    
    // Redis 채널로 메시지 발행
    await publishMessage(
      `chat:${channel}`,
      JSON.stringify(message)
    );
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('메시지 전송 중 오류 발생:', error);
    return NextResponse.json(
      { error: '메시지 전송 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}