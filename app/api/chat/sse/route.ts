import { NextRequest, NextResponse } from 'next/server';
import { subscribeToChannel } from '@/lib/redis/client';
import Redis from 'ioredis';

// 클라이언트 연결 목록
const clients = new Map<string, ReadableStreamController<Uint8Array>>();

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(request: NextRequest) {
  const channel = request.nextUrl.searchParams.get('channel');
  
  if (!channel) {
    return new NextResponse('채널 매개변수가 필요합니다', { status: 400 });
  }

  // SSE 스트림 생성
  const stream = new ReadableStream({
    start: async (controller) => {
      // 고유한 클라이언트 ID 생성
      const clientId = Date.now().toString();
      clients.set(clientId, controller);
      
      // 초기 연결 메시지 전송
      const connectEvent = `data: ${JSON.stringify({ type: 'connect', message: 'Connected to SSE' })}\n\n`;
      controller.enqueue(new TextEncoder().encode(connectEvent));
      
      // Redis 채널 구독
      let subscriber: Redis | null = null;
      try {
        subscriber = await subscribeToChannel(`chat:${channel}`, (message) => {
          try {
            // 메시지를 SSE 형식으로 보냄
            const event = `data: ${message}\n\n`;
            controller.enqueue(new TextEncoder().encode(event));
          } catch (error) {
            console.error('메시지 전송 중 오류 발생:', error);
          }
        });
      } catch (error) {
        console.error('Redis 구독 중 오류 발생:', error);
        controller.error(error);
      }
      
      // 연결 종료 시 정리
      request.signal.addEventListener('abort', () => {
        if (subscriber) subscriber.disconnect();
        clients.delete(clientId);
      });
    },
    cancel: () => {
      // 스트림이 취소될 때 정리 작업
    },
  });

  // SSE 응답 반환
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}