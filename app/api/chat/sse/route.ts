import { NextRequest, NextResponse } from 'next/server';
import { subscribeToChannel } from '@/lib/redis/client';
import Redis from 'ioredis';

// 클라이언트 연결 목록
// 키: 클라이언트ID, 값: {controller: ReadableStreamController, subscriber: Redis 인스턴스, pingInterval: NodeJS.Timeout}
type ClientConnection = {
  controller: ReadableStreamController<Uint8Array>;
  subscriber: Redis | null;
  pingInterval: NodeJS.Timeout | null;
  channel: string;
};

const clients = new Map<string, ClientConnection>();

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(request: NextRequest) {
  const channel = request.nextUrl.searchParams.get('channel');
  const userId = request.nextUrl.searchParams.get('userId');
  
  if (!channel) {
    return new NextResponse('채널 매개변수가 필요합니다', { status: 400 });
  }

  // 클라이언트 ID 생성 또는 재사용
  const clientId = userId || 
                   request.cookies.get('clientId')?.value || 
                   `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // 연결 정보 얻기
  const clientInfo = clients.get(clientId);
  
  // 클라이언트가 이미 다른 채널에 연결되어 있었다면 이전 연결 정리
  if (clientInfo) {
    console.log(`클라이언트 ${clientId}가 채널 ${clientInfo.channel}에서 ${channel}로 전환`);
    
    // 이전 PingInterval 정리
    if (clientInfo.pingInterval) {
      clearInterval(clientInfo.pingInterval);
    }
    
    // 이전 Redis 구독 정리
    if (clientInfo.subscriber) {
      try {
        clientInfo.subscriber.disconnect();
      } catch (error) {
        console.error('이전 Redis 구독 해제 중 오류:', error);
      }
    }
    
    // 클라이언트에게 채널 전환 알림
    try {
      const switchEvent = `data: ${JSON.stringify({ 
        type: 'channel-switch', 
        fromChannel: clientInfo.channel,
        toChannel: channel,
        message: `채널이 ${clientInfo.channel}에서 ${channel}로 전환되었습니다.`,
        timestamp: Date.now()
      })}\n\n`;
      clientInfo.controller.enqueue(new TextEncoder().encode(switchEvent));
    } catch (error) {
      console.error('채널 전환 알림 전송 중 오류:', error);
    }
    
    // 이전 연결 종료
    try {
      // 연결 종료 메시지 전송 후 스트림 종료
      const closeEvent = `data: ${JSON.stringify({ 
        type: 'connection-closed', 
        message: '이전 연결이 종료되었습니다. 새 채널에 연결합니다.',
        timestamp: Date.now()
      })}\n\n`;
      clientInfo.controller.enqueue(new TextEncoder().encode(closeEvent));
      clientInfo.controller.close();
    } catch (error) {
      console.error('이전 연결 종료 중 오류:', error);
    }
    
    // 맵에서 이전 클라이언트 연결 정보 삭제
    clients.delete(clientId);
  }

  // SSE 스트림 생성
  const stream = new ReadableStream({
    start: async (controller) => {
      let subscriber: Redis | null = null;
      let pingInterval: NodeJS.Timeout | null = null;
      
      try {
        // 클라이언트 연결 정보 저장
        clients.set(clientId, {
          controller,
          subscriber: null,
          pingInterval: null,
          channel
        });
        
        // 초기 연결 메시지 전송
        const connectEvent = `data: ${JSON.stringify({ 
          type: 'connect', 
          clientId, 
          channel,
          message: `채널 ${channel}에 연결되었습니다.`, 
          timestamp: Date.now() 
        })}\n\n`;
        controller.enqueue(new TextEncoder().encode(connectEvent));
        
        // 연결 유지를 위한 주기적인 핑 전송
        pingInterval = setInterval(() => {
          try {
            const pingEvent = `data: ${JSON.stringify({ 
              type: 'ping',
              channel,
              timestamp: Date.now() 
            })}\n\n`;
            controller.enqueue(new TextEncoder().encode(pingEvent));
          } catch (error) {
            console.error(`클라이언트 ${clientId} 핑 전송 중 오류:`, error);
            
            // 오류 발생 시 interval 정리
            if (pingInterval) {
              clearInterval(pingInterval);
              
              // 클라이언트 맵 업데이트
              const clientInfo = clients.get(clientId);
              if (clientInfo) {
                clientInfo.pingInterval = null;
              }
            }
          }
        }, 30000); // 30초마다 핑 전송
        
        // pingInterval 저장
        const clientInfo = clients.get(clientId);
        if (clientInfo) {
          clientInfo.pingInterval = pingInterval;
        }
        
        // Redis 채널 구독
        try {
          subscriber = await subscribeToChannel(`chat:${channel}`, (message) => {
            try {
              // 메시지를 SSE 형식으로 보냄
              const event = `data: ${message}\n\n`;
              controller.enqueue(new TextEncoder().encode(event));
            } catch (error) {
              console.error(`클라이언트 ${clientId} 메시지 전송 중 오류 발생:`, error);
            }
          });
          
          // subscriber 저장
          const clientInfo = clients.get(clientId);
          if (clientInfo) {
            clientInfo.subscriber = subscriber;
          }
        } catch (error) {
          console.error(`클라이언트 ${clientId} Redis 구독 중 오류 발생:`, error);
          
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
          cleanupConnection(clientId);
          console.log(`클라이언트 연결 종료: ${clientId}, 현재 연결: ${clients.size}`);
        });
      } catch (error) {
        console.error(`클라이언트 ${clientId} SSE 스트림 처리 중 오류:`, error);
        cleanupConnection(clientId);
        controller.error(error);
      }
    },
    cancel: (reason) => {
      // 스트림이 취소될 때 정리 작업
      console.log(`클라이언트 ${clientId} SSE 스트림 취소됨:`, reason);
      cleanupConnection(clientId);
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

// 연결 정리 헬퍼 함수
function cleanupConnection(clientId: string) {
  const clientInfo = clients.get(clientId);
  
  if (clientInfo) {
    // Ping Interval 정리
    if (clientInfo.pingInterval) {
      clearInterval(clientInfo.pingInterval);
    }
    
    // Redis 구독 정리
    if (clientInfo.subscriber) {
      try {
        clientInfo.subscriber.disconnect();
      } catch (error) {
        console.error(`클라이언트 ${clientId} Redis 구독 해제 중 오류:`, error);
      }
    }
    
    // 맵에서 클라이언트 제거
    clients.delete(clientId);
  }
}