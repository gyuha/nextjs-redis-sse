import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { headers } from 'next/headers';

// SSE 엔드포인트 처리
export async function GET(request: NextRequest) {
  // 요청 파라미터 가져오기
  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get('channelId');
  
  // 채널 ID가 없으면 에러
  if (!channelId) {
    return NextResponse.json(
      { error: '채널 ID가 필요합니다.' },
      { status: 400 }
    );
  }

  // Redis 클라이언트 가져오기
  const redis = await getRedisClient();
  const subscriber = redis.duplicate();
  await subscriber.connect();

  // SSE 응답 생성
  const encoder = new TextEncoder();
  let isControllerClosed = false; // 컨트롤러 상태를 추적하기 위한 플래그

  const stream = new ReadableStream({
    async start(controller) {
      // 클라이언트에게 연결 성공 알림
      controller.enqueue(encoder.encode('event: connected\ndata: 연결되었습니다.\n\n'));

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
      });
      
      // 클라이언트 연결 종료 감지
      async function cleanup() {
        try {
          await subscriber.unsubscribe(`channel:${channelId}`);
        } catch (e) {
          console.error('채널 구독 해제 오류:', e);
        }
        try {
          await subscriber.unsubscribe(`users:update:${channelId}`);
        } catch (e) {
          console.error('사용자 목록 구독 해제 오류:', e);
        }
        try {
          await subscriber.quit();
        } catch (e) {
          console.error('Redis quit 오류:', e);
        }
        if (!isControllerClosed) {
          isControllerClosed = true;
          try { controller.close(); } catch (closeError) { console.error('컨트롤러 닫기 오류:', closeError); }
        }
      }
      request.signal.addEventListener('abort', cleanup);
      // 스트림 cancel 이벤트도 정리
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