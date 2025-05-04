import { NextResponse } from 'next/server';
import { publishMessage } from '@/lib/redis/client';
import { ChatMessage } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { channel, message } = body;
    
    // 요청 유효성 검사
    if (!channel) {
      return NextResponse.json(
        { error: '채널 정보가 필요합니다.' },
        { status: 400 }
      );
    }
    
    if (!message) {
      return NextResponse.json(
        { error: '메시지 내용이 필요합니다.' },
        { status: 400 }
      );
    }
    
    // 메시지 형식 검증
    if (!message.id || !message.channel || !message.sender || !message.content || !message.timestamp) {
      return NextResponse.json(
        { error: '메시지 형식이 올바르지 않습니다.' },
        { status: 400 }
      );
    }
    
    // 채널 일치 여부 확인
    if (message.channel !== channel) {
      return NextResponse.json(
        { error: '메시지 채널이 요청 채널과 일치하지 않습니다.' },
        { status: 400 }
      );
    }

    // 내용 길이 제한 (10,000자)
    if (message.content.length > 10000) {
      return NextResponse.json(
        { error: '메시지 내용이 너무 깁니다 (최대 10,000자).' },
        { status: 400 }
      );
    }
    
    // Redis 채널로 메시지 발행
    try {
      await publishMessage(
        `chat:${channel}`,
        JSON.stringify(message)
      );
    } catch (error) {
      console.error('Redis 메시지 발행 중 오류 발생:', error);
      return NextResponse.json(
        { error: 'Redis 서버 오류가 발생했습니다.' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      success: true,
      messageId: message.id,
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error('메시지 전송 중 오류 발생:', error);
    return NextResponse.json(
      { error: '메시지 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}