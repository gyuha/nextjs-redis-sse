import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { headers } from 'next/headers';
import { removeUserFromChannel, getChannelUsers, addUserToChannel } from '@/lib/pubsub';

// Redis 정리 작업 시간 제한 설정 (밀리초)
const REDIS_CLEANUP_TIMEOUT = 2000;

// SSE 연결에 대한 최대 활성 시간 (밀리초, 기본 2시간)
const SSE_MAX_DURATION = 2 * 60 * 60 * 1000; 

// SSE 엔드포인트 처리
export async function GET(request: NextRequest) {
  // 요청 파라미터 가져오기
  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get('channelId');
  const username = searchParams.get('username');
  
  // 채널 ID가 없으면 에러
  if (!channelId) {
    return NextResponse.json(
      { error: '채널 ID가 필요합니다.' },
      { status: 400 }
    );
  }

  // 연결 시작 시간 기록 (최대 지속 시간 제한용)
  const connectionStartTime = Date.now();
  console.log(`[SSE] ${username || '익명'} 사용자가 ${channelId} 채널에 연결 시작`);

  try {
    // 사용자를 채널에 추가 (명시적 처리)
    if (username) {
      await addUserToChannel(channelId, username);
      console.log(`[SSE] ${username} 사용자를 ${channelId} 채널에 추가함`);
    }

    // Redis 클라이언트 가져오기
    const redis = await getRedisClient();
    const subscriber = redis.duplicate();
    await subscriber.connect();

    // 사용자 목록 업데이트 발행 (본인 입장 메시지)
    if (username) {
      const users = await getChannelUsers(channelId);
      await redis.publish(`users:update:${channelId}`, JSON.stringify(users));
      
      // 시스템 메시지 발행 (입장 알림)
      const joinNotification = {
        id: `join-${Date.now()}`,
        type: 'system',
        content: `${username}님이 입장했습니다.`,
        username: '시스템',
        timestamp: new Date().toISOString()
      };
      await redis.publish(`channel:${channelId}`, JSON.stringify(joinNotification));
    }

    // SSE 응답 생성
    const encoder = new TextEncoder();
    let isControllerClosed = false; // 컨트롤러 상태를 추적하기 위한 플래그
    let cleanupExecuted = false; // 정리 함수가 이미 실행되었는지 확인

    const stream = new ReadableStream({
      async start(controller) {
        // 클라이언트에게 연결 성공 알림
        controller.enqueue(encoder.encode('event: connected\ndata: 연결되었습니다.\n\n'));

        // 주기적으로 하트비트를 보내서 연결 유지
        const heartbeatInterval = setInterval(() => {
          try {
            if (!isControllerClosed) {
              controller.enqueue(encoder.encode(': heartbeat\n\n'));
            } else {
              clearInterval(heartbeatInterval);
            }
          } catch (err) {
            clearInterval(heartbeatInterval);
          }
        }, 30000); // 30초마다

        // 최대 연결 지속 시간 이후 자동으로 연결 종료
        const connectionTimeout = setTimeout(() => {
          console.log(`[SSE] ${username || '익명'} 사용자의 ${channelId} 채널 연결이 최대 시간을 초과하여 종료됩니다.`);
          cleanup();
        }, SSE_MAX_DURATION);

        // 채널 구독
        await subscriber.subscribe(`channel:${channelId}`, (message) => {
          try {
            if (!isControllerClosed) {
              controller.enqueue(encoder.encode(`event: message\ndata: ${message}\n\n`));
            }
          } catch (err) {
            console.error('메시지 이벤트 처리 중 오류:', err);
            if (!isControllerClosed) {
              isControllerClosed = true;
              try { controller.close(); } catch {}
            }
          }
        });

        // 사용자 목록 변경 구독
        await subscriber.subscribe(`users:update:${channelId}`, (message) => {
          try {
            if (!isControllerClosed) {
              controller.enqueue(encoder.encode(`event: users\ndata: ${message}\n\n`));
            }
          } catch (err) {
            console.error('사용자 목록 이벤트 처리 중 오류:', err);
            if (!isControllerClosed) {
              isControllerClosed = true;
              try { controller.close(); } catch {}
            }
          }
        });
        
        // 에러 핸들링
        subscriber.on('error', (err) => {
          console.error('Redis 구독 에러:', err);
          if (!isControllerClosed) {
            controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: '서버 오류가 발생했습니다.' })}\n\n`));
            isControllerClosed = true;
            try { controller.close(); } catch {}
          }
          cleanup();
        });
        
        // 클라이언트 연결 종료 감지를 위한 정리 함수
        async function cleanup() {
          if (cleanupExecuted) return; // 이미 실행된 경우 중복 실행 방지
          cleanupExecuted = true;
          
          console.log(`[SSE] ${username || '익명'} 사용자의 ${channelId} 채널 연결 정리 시작`);
          
          // 타이머 정리
          clearInterval(heartbeatInterval);
          clearTimeout(connectionTimeout);

          // 사용자 퇴장 처리
          if (username) {
            try {
              await removeUserFromChannel(channelId, username);
              const users = await getChannelUsers(channelId);
              
              // 사용자 목록 업데이트 발행
              await redis.publish(`users:update:${channelId}`, JSON.stringify(users));
              
              // 시스템 메시지 발행
              const notification = {
                id: `leave-${Date.now()}`,
                type: 'system',
                content: `${username}님이 퇴장했습니다.`,
                username: '시스템',
                timestamp: new Date().toISOString()
              };
              await redis.publish(`channel:${channelId}`, JSON.stringify(notification));
            } catch (leaveError) {
              console.error(`[SSE] ${username} 사용자 퇴장 처리 오류:`, leaveError);
            }
          }

          // Redis 리소스 정리 - Promise.race로 타임아웃 설정
          const cleanupTasks = async () => {
            try {
              await subscriber.unsubscribe(`channel:${channelId}`);
              await subscriber.unsubscribe(`users:update:${channelId}`);
              await subscriber.quit();
              console.log(`[SSE] ${channelId} 채널의 Redis 구독 정리 완료`);
            } catch (e) {
              console.error(`[SSE] ${channelId} 채널의 Redis 정리 오류:`, e);
            }
          };

          const timeout = new Promise(resolve => setTimeout(resolve, REDIS_CLEANUP_TIMEOUT));
          
          await Promise.race([
            cleanupTasks(),
            timeout.then(() => console.warn(`[SSE] ${channelId} 채널의 Redis 정리 시간 초과`))
          ]);

          // 컨트롤러 닫기
          if (!isControllerClosed) {
            isControllerClosed = true;
            try { 
              controller.close();
              console.log(`[SSE] ${channelId} 채널의 스트림 컨트롤러 닫기 완료`);
            } catch (closeError) { 
              console.error(`[SSE] ${channelId} 채널의 스트림 컨트롤러 닫기 오류:`, closeError); 
            }
          }
          
          const duration = Math.round((Date.now() - connectionStartTime) / 1000);
          console.log(`[SSE] ${username || '익명'} 사용자의 ${channelId} 채널 연결이 ${duration}초 후 종료되었습니다.`);
        }
        
        // 연결 중단 이벤트 구독
        request.signal.addEventListener('abort', cleanup);
        stream.cancel = cleanup;
      }
    });

    // SSE 응답 반환
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error(`[SSE] ${channelId} 채널 연결 설정 중 오류:`, error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// OPTIONS 요청 처리 (CORS 지원)
export async function OPTIONS() {
  const headersList = headers();
  const referer = headersList.get('referer') || '';
  
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': referer || '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}