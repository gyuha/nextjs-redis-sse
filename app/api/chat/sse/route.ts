import { NextRequest, NextResponse } from 'next/server';
import { subscribeToChannel } from '@/lib/redis/client';
import Redis from 'ioredis';

// 클라이언트 연결 목록
// 키: 클라이언트ID, 값: {controller: ReadableStreamController, subscriber: Redis 인스턴스, pingInterval: NodeJS.Timeout}
type ClientConnection = {
  controller: ReadableStreamController<Uint8Array>;
  subscriber: Redis | null;
  pingInterval: NodeJS.Timeout | null;
  heartbeatInterval: NodeJS.Timeout | null; // 하트비트 간격 추가
  channel: string;
  isActive: boolean; // 컨트롤러가 활성 상태인지 여부
  joinedAt: number; // 클라이언트 연결 시작 시간
  lastPingTime: number; // 마지막 핑 시간 추적
  reconnectAttempts: number; // 재연결 시도 횟수
};

const clients = new Map<string, ClientConnection>();

// 연결 상태 주기적으로 체크 (5초마다)
const connectionChecker = setInterval(() => {
  const now = Date.now();
  clients.forEach((client, clientId) => {
    // 2분 이상 응답이 없으면 연결 정리
    const MAX_IDLE_TIME = 120000; // 2분
    if (now - client.lastPingTime > MAX_IDLE_TIME && client.isActive) {
      console.log(`클라이언트 ${clientId} 연결 시간 초과로 정리 (마지막 활동: ${now - client.lastPingTime}ms 전)`);
      client.isActive = false;
      cleanupConnection(clientId);
    }
  });
}, 5000);

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
    
    // 이전 연결 정리
    cleanupConnection(clientId);
  }

  // SSE 스트림 생성
  const stream = new ReadableStream({
    start: async (controller) => {
      let subscriber: Redis | null = null;
      let pingInterval: NodeJS.Timeout | null = null;
      let heartbeatInterval: NodeJS.Timeout | null = null;
      const connectionStartTime = Date.now();
      
      try {
        // 클라이언트 연결 정보 저장
        clients.set(clientId, {
          controller,
          subscriber: null,
          pingInterval: null,
          heartbeatInterval: null,
          channel,
          isActive: true, // 새 컨트롤러는 활성 상태로 시작
          joinedAt: connectionStartTime,
          lastPingTime: connectionStartTime,
          reconnectAttempts: 0
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
        
        // 연결 유지를 위한 주기적인 핑 전송 (30초마다)
        pingInterval = setInterval(() => {
          const clientInfo = clients.get(clientId);
          if (!clientInfo || !clientInfo.isActive) {
            // 클라이언트가 없거나 비활성 상태면 interval 정리
            if (pingInterval) clearInterval(pingInterval);
            return;
          }
          
          try {
            const pingEvent = `data: ${JSON.stringify({ 
              type: 'ping',
              channel,
              timestamp: Date.now() 
            })}\n\n`;
            controller.enqueue(new TextEncoder().encode(pingEvent));
            
            // 마지막 핑 시간 업데이트
            clientInfo.lastPingTime = Date.now();
          } catch (error) {
            console.error(`클라이언트 ${clientId} 핑 전송 중 오류:`, error);
            
            // 오류 발생 시 interval 정리 및 클라이언트 상태 업데이트
            if (pingInterval) {
              clearInterval(pingInterval);
            }
            
            // 클라이언트 맵 업데이트
            const clientInfo = clients.get(clientId);
            if (clientInfo) {
              clientInfo.pingInterval = null;
              clientInfo.isActive = false;
            }
            
            // 클라이언트 정리
            cleanupConnection(clientId);
          }
        }, 30000); // 30초마다 핑 전송
        
        // 더 빈번한 하트비트 전송 (5초마다)
        heartbeatInterval = setInterval(() => {
          const clientInfo = clients.get(clientId);
          if (!clientInfo || !clientInfo.isActive) {
            // 클라이언트가 없거나 비활성 상태면 interval 정리
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            return;
          }
          
          try {
            // 가벼운 하트비트 이벤트 (주석 형태로 전송하여 클라이언트에 표시되지 않음)
            controller.enqueue(new TextEncoder().encode(`: heartbeat ${Date.now()}\n\n`));
            
            // 마지막 활동 시간 업데이트
            clientInfo.lastPingTime = Date.now();
          } catch (error) {
            // 오류 로그만 남기고 연결을 끊지는 않음 (핑 인터벌에서 처리)
            console.error(`클라이언트 ${clientId} 하트비트 전송 중 오류:`, error);
          }
        }, 5000); // 5초마다 하트비트 전송
        
        // pingInterval 저장
        const clientInfo = clients.get(clientId);
        if (clientInfo) {
          clientInfo.pingInterval = pingInterval;
          clientInfo.heartbeatInterval = heartbeatInterval;
        }
        
        // Redis 채널 구독
        try {
          subscriber = await subscribeToChannel(`chat:${channel}`, (message) => {
            try {
              // 메시지 처리 전에 클라이언트와 컨트롤러의 상태를 확인
              const currentClientInfo = clients.get(clientId);
              
              if (!currentClientInfo || !currentClientInfo.isActive) {
                console.log(`클라이언트 ${clientId}에 메시지를 전송할 수 없음: 연결이 닫혔거나 비활성 상태`);
                return;
              }
              
              // 메시지 파싱
              const messageData = JSON.parse(message);
              
              // 클라이언트 연결 시간 이후의 메시지만 전송 (이전 채팅 로그는 무시)
              if (messageData.timestamp && messageData.timestamp < currentClientInfo.joinedAt) {
                console.log(`클라이언트 ${clientId}에 이전 메시지 전송 건너뜀 (timestamp: ${messageData.timestamp}, joinedAt: ${currentClientInfo.joinedAt})`);
                return;
              }
              
              // 메시지를 SSE 형식으로 보냄
              const event = `data: ${message}\n\n`;
              controller.enqueue(new TextEncoder().encode(event));
              
              // 메시지 전송 성공 시 활동 시간 업데이트
              currentClientInfo.lastPingTime = Date.now();
            } catch (error) {
              const errorMsg = error instanceof Error ? error.toString() : String(error);
              const isControllerClosed = errorMsg.includes('Controller is already closed');
              
              if (isControllerClosed) {
                console.log(`클라이언트 ${clientId}의 컨트롤러가 이미 닫혔습니다.`);
              } else {
                console.error(`클라이언트 ${clientId} 메시지 전송 중 오류 발생:`, error);
              }
              
              // 컨트롤러가 닫힌 경우만 연결 정리
              if (isControllerClosed) {
                // 클라이언트 상태를 비활성으로 표시 및 연결 정리
                const currentClientInfo = clients.get(clientId);
                if (currentClientInfo) {
                  currentClientInfo.isActive = false;
                  cleanupConnection(clientId);
                }
              }
            }
          });
          
          // subscriber 저장
          const updatedClientInfo = clients.get(clientId);
          if (updatedClientInfo) {
            updatedClientInfo.subscriber = subscriber;
          }
        } catch (error) {
          console.error(`클라이언트 ${clientId} Redis 구독 중 오류 발생:`, error);
          
          // 오류 메시지 전송 시도
          try {
            const errorEvent = `data: ${JSON.stringify({ 
              type: 'error', 
              message: '서버 오류가 발생했습니다. 잠시 후 다시 시도합니다.',
              timestamp: Date.now()
            })}\n\n`;
            controller.enqueue(new TextEncoder().encode(errorEvent));
          } catch (msgError) {
            console.error(`오류 메시지 전송 중 추가 오류 발생:`, msgError);
          }
          
          // 재연결 지연 시간 설정 (1초)
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // 클라이언트가 여전히 유효하면 재연결 시도
          const currentClientInfo = clients.get(clientId);
          if (currentClientInfo && currentClientInfo.isActive) {
            if (currentClientInfo.reconnectAttempts < 5) {
              currentClientInfo.reconnectAttempts++;
              console.log(`Redis 구독 재연결 시도 ${currentClientInfo.reconnectAttempts}/5 (클라이언트 ${clientId})`);
              
              try {
                // Redis 재연결 시도
                subscriber = await subscribeToChannel(`chat:${channel}`, handleMessage);
                
                if (subscriber) {
                  currentClientInfo.subscriber = subscriber;
                  currentClientInfo.reconnectAttempts = 0; // 성공 시 카운터 초기화
                  
                  // 재연결 성공 메시지
                  const reconnectEvent = `data: ${JSON.stringify({ 
                    type: 'reconnect', 
                    message: '서버에 재연결되었습니다.',
                    timestamp: Date.now()
                  })}\n\n`;
                  controller.enqueue(new TextEncoder().encode(reconnectEvent));
                }
              } catch (reconnectError) {
                console.error(`재연결 시도 중 오류:`, reconnectError);
              }
            } else {
              // 최대 재시도 횟수 초과
              console.log(`최대 재연결 시도 횟수 초과 (클라이언트 ${clientId})`);
              cleanupConnection(clientId);
            }
          }
        }
        
        // 메시지 핸들러 함수 (위의 콜백에서 재사용)
        function handleMessage(message: string) {
          try {
            // 메시지 처리 전에 클라이언트와 컨트롤러의 상태를 확인
            const currentClientInfo = clients.get(clientId);
            
            if (!currentClientInfo || !currentClientInfo.isActive) {
              console.log(`클라이언트 ${clientId}에 메시지를 전송할 수 없음: 연결이 닫혔거나 비활성 상태`);
              return;
            }
            
            // 메시지 파싱
            const messageData = JSON.parse(message);
            
            // 클라이언트 연결 시간 이후의 메시지만 전송
            if (messageData.timestamp && messageData.timestamp < currentClientInfo.joinedAt) {
              console.log(`클라이언트 ${clientId}에 이전 메시지 전송 건너뜀 (timestamp: ${messageData.timestamp}, joinedAt: ${currentClientInfo.joinedAt})`);
              return;
            }
            
            // 메시지를 SSE 형식으로 보냄
            const event = `data: ${message}\n\n`;
            controller.enqueue(new TextEncoder().encode(event));
            
            // 활동 시간 업데이트
            currentClientInfo.lastPingTime = Date.now();
          } catch (error) {
            const errorMsg = error instanceof Error ? error.toString() : String(error);
            const isControllerClosed = errorMsg.includes('Controller is already closed');
            
            if (isControllerClosed) {
              console.log(`클라이언트 ${clientId}의 컨트롤러가 이미 닫혔습니다.`);
            } else {
              console.error(`클라이언트 ${clientId} 메시지 전송 중 오류 발생:`, error);
            }
            
            // 컨트롤러가 닫힌 경우만 연결 정리
            if (isControllerClosed) {
              const currentClientInfo = clients.get(clientId);
              if (currentClientInfo) {
                currentClientInfo.isActive = false;
                cleanupConnection(clientId);
              }
            }
          }
        }
        
        // 연결 종료 시 정리
        request.signal.addEventListener('abort', () => {
          console.log(`클라이언트 연결 중단 신호 감지: ${clientId}`);
          const clientInfo = clients.get(clientId);
          if (clientInfo) {
            clientInfo.isActive = false;
          }
          cleanupConnection(clientId);
          console.log(`클라이언트 연결 종료: ${clientId}, 현재 연결: ${clients.size}`);
        });
      } catch (error) {
        console.error(`클라이언트 ${clientId} SSE 스트림 처리 중 오류:`, error);
        // 상태 업데이트 및 정리
        const clientInfo = clients.get(clientId);
        if (clientInfo) {
          clientInfo.isActive = false;
        }
        cleanupConnection(clientId);
        controller.error(error);
      }
    },
    cancel: (reason) => {
      // 스트림이 취소될 때 정리 작업
      console.log(`클라이언트 ${clientId} SSE 스트림 취소됨:`, reason);
      // 상태 업데이트 및 정리
      const clientInfo = clients.get(clientId);
      if (clientInfo) {
        clientInfo.isActive = false;
      }
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
    // 상태 업데이트
    clientInfo.isActive = false;
    
    // Ping Interval 정리
    if (clientInfo.pingInterval) {
      clearInterval(clientInfo.pingInterval);
      clientInfo.pingInterval = null;
    }
    
    // Heartbeat Interval 정리
    if (clientInfo.heartbeatInterval) {
      clearInterval(clientInfo.heartbeatInterval);
      clientInfo.heartbeatInterval = null;
    }
    
    // Redis 구독 정리
    if (clientInfo.subscriber) {
      try {
        clientInfo.subscriber.disconnect();
        clientInfo.subscriber = null;
      } catch (error) {
        console.error(`클라이언트 ${clientId} Redis 구독 해제 중 오류:`, error);
      }
    }
    
    // 컨트롤러 안전하게 닫기
    try {
      clientInfo.controller.close();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.toString() : String(error);
      const isControllerClosed = errorMsg.includes('Controller is already closed');
      if (!isControllerClosed) {
        console.error(`클라이언트 ${clientId} 컨트롤러 닫기 중 오류:`, error);
      }
    }
    
    // 맵에서 클라이언트 제거
    clients.delete(clientId);
  }
}

// 프로세스 종료 시 모든 연결 정리
process.on('beforeExit', () => {
  console.log('프로세스 종료 중 - 모든 클라이언트 연결 정리');
  clients.forEach((_, clientId) => {
    cleanupConnection(clientId);
  });
  
  // 연결 체커 인터벌 정리
  clearInterval(connectionChecker);
});