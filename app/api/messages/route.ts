import { NextRequest, NextResponse } from 'next/server';
import { publishMessage } from '@/lib/pubsub';
import { v4 as uuidv4 } from 'uuid';
import DOMPurify from 'isomorphic-dompurify';

// 메시지 전송 핸들러
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channelId, content, username } = body;
    
    // 필수 필드 검증
    if (!channelId || !content || !username) {
      return NextResponse.json(
        { error: '채널 ID, 내용 및 사용자 이름은 필수입니다.' },
        { status: 400 }
      );
    }

    // 콘텐츠 정제 (XSS 방지)
    const cleanContent = DOMPurify.sanitize(content);
    
    // 메시지 객체 생성
    const message = {
      id: uuidv4(),
      channelId,
      content: cleanContent,
      username,
      timestamp: Date.now()
    };
    
    // Redis에 메시지 발행
    await publishMessage(channelId, message);
    
    return NextResponse.json({ success: true, message });
  } catch (error: any) {
    console.error('메시지 전송 에러:', error);
    return NextResponse.json(
      { error: '메시지를 전송할 수 없습니다.', details: error.message },
      { status: 500 }
    );
  }
}

// 채널 메시지 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    if (!channelId) {
      return NextResponse.json(
        { error: '채널 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    // Redis에서 최근 메시지 가져오기
    const { getRecentMessages } = await import('@/lib/pubsub');
    const messages = await getRecentMessages(channelId, limit);

    return NextResponse.json({ messages });
  } catch (error: any) {
    console.error('메시지 조회 에러:', error);
    return NextResponse.json(
      { error: '메시지를 조회할 수 없습니다.', details: error.message },
      { status: 500 }
    );
  }
}