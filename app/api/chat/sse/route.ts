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
      const clientId = Date.now().toString() + '-' + Math.random().toString(36).substring(2, 9);
      clients.set(clientId, controller);
      
      try {
        // 초기 연결 메시지 전송
        const connectEvent = `data: ${JSON.stringify({ type: 'connect', message: 'Connected to SSE', timestamp: Date.now() })}\n\n`;
        controller.enqueue(new TextEncoder().encode(connectEvent));
        
        // 연결 유지를 위한 주기적인 핑 전송
        const pingInterval = setInterval(() => {
          try {
            const pingEvent = `data: ${JSON.stringify({ type: 'ping', timestamp: Date.now() })}\n\n`;
            controller.enqueue(new TextEncoder().encode(pingEvent));
          } catch (error) {
            console.error('핑 전송 중 오류:', error);
            clearInterval(pingInterval);
          }
        }, 30000); // 30초마다 핑 전송
        
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
          
          // 오류 메시지 전송 후 연결 유지 (자동 재연결 시도)
          const errorEvent = `data: ${JSON.stringify({ 
            type: 'error', 
            message: '서버 오류가 발생했습니다. 잠시 후 다시 시도합니다.',
            timestamp: Date.now()
          })}\n\n`;
          controller.enqueue(new TextEncoder().encode(errorEvent));
        }
        
        // 연결 종료 시 정리
        request.signal.addEventListener('abort', () => {
          if (subscriber) {
            try {
              subscriber.disconnect();
            } catch (error) {
              console.error('Redis 구독 해제 중 오류:', error);
            }
          }
          clearInterval(pingInterval);
          clients.delete(clientId);
          console.log(`클라이언트 연결 종료: ${clientId}, 현재 연결: ${clients.size}`);
        });
      } catch (error) {
        console.error('SSE 스트림 처리 중 오류:', error);
        controller.error(error);
        clients.delete(clientId);
      }
    },
    cancel: () => {
      // 스트림이 취소될 때 정리 작업
      console.log('SSE 스트림 취소됨');
    },
  });

  // SSE 응답 반환
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Nginx 프록시 버퍼링 비활성화 (SSE 지연 방지)
    },
  });
}