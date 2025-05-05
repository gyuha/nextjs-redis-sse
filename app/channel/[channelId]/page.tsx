'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';

import { ChannelSidebar } from '@/components/sidebar/channel-sidebar';
import { MessageList } from '@/components/chat/message-list';
import { MessageInput } from '@/components/chat/message-input';
import { MessageProps } from '@/components/chat/message-item';

export default function ChannelPage() {
  const params = useParams();
  const router = useRouter();
  const { channelId } = params;
  
  // 상태 관리
  const [username, setUsername] = useState<string>('');
  const [messages, setMessages] = useState<MessageProps[]>([]);
  const [activeUsers, setActiveUsers] = useState<string[]>([]);
  const [connected, setConnected] = useState<boolean>(false);

  // 사용자 이름 가져오기
  useEffect(() => {
    // 클라이언트 사이드에서만 실행
    const storedUsername = sessionStorage.getItem('username');
    if (!storedUsername) {
      // 사용자 이름이 없으면 메인 페이지로 리다이렉트
      router.push('/');
      return;
    }
    setUsername(storedUsername);

    // 테스트를 위한 더미 메시지 생성
    setMessages([
      {
        id: '1',
        content: '안녕하세요! 채팅방에 오신 것을 환영합니다.',
        username: '시스템',
        timestamp: new Date().toISOString(),
      },
      {
        id: '2',
        content: `${channelId} 채널에 입장하셨습니다.`,
        username: '시스템',
        timestamp: new Date().toISOString(),
      }
    ]);

    // 테스트를 위한 더미 활성 사용자
    setActiveUsers(['시스템', storedUsername, '방문자1', '방문자2']);
    
    // 연결 상태 설정
    setConnected(true);

    // 클린업 함수
    return () => {
      // SSE 연결 종료 등 정리 작업
      setConnected(false);
    };
  }, [channelId, router]);

  // 메시지 전송 처리
  const handleSendMessage = async (content: string) => {
    if (!content.trim() || !username || !connected) return;

    // 새 메시지 객체 생성
    const newMessage: MessageProps = {
      id: uuidv4(),
      content,
      username,
      timestamp: new Date().toISOString(),
    };

    // UI 상태 업데이트 (낙관적 업데이트)
    setMessages((prev) => [...prev, newMessage]);

    try {
      // TODO: Redis Pub/Sub을 통한 메시지 전송 구현
      // 서버로 메시지 전송 (추후 구현)
      // await fetch('/api/messages', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ channelId, message: newMessage }),
      // });
    } catch (error) {
      console.error('메시지 전송 중 오류 발생:', error);
    }
  };

  // 사용자 이름이 없는 경우 (로딩 상태)
  if (!username) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse text-lg">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* 사이드바 */}
      <ChannelSidebar username={username} activeUsers={activeUsers} />
      
      {/* 채팅 영역 */}
      <div className="flex flex-1 flex-col h-full">
        {/* 채널 헤더 */}
        <div className="border-b p-4">
          <h2 className="text-xl font-bold"># {channelId}</h2>
          <p className="text-sm text-muted-foreground">
            {connected ? '연결됨' : '연결 중...'}
          </p>
        </div>
        
        {/* 메시지 목록 */}
        <MessageList messages={messages} currentUsername={username} />
        
        {/* 메시지 입력 */}
        <MessageInput 
          onSendMessage={handleSendMessage} 
          disabled={!connected}
        />
      </div>
    </div>
  );
}