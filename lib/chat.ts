import { useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useChatStore } from './store';
import { ChatMessage } from './pubsub';

// SSE 연결 관리 훅
export function useSSEConnection(channelId: string, username: string) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const {
    setConnected,
    setConnecting,
    setConnectionError,
    addMessage,
    setChannelUsers,
  } = useChatStore();

  useEffect(() => {
    // 채널 ID나 사용자 이름이 없으면 연결하지 않음
    if (!channelId || !username) {
      setConnectionError('채널 ID와 사용자 이름이 필요합니다.');
      return;
    }

    // 이미 연결된 EventSource가 있으면 닫기
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // 연결 시작 상태로 설정
    setConnecting(true);
    setConnectionError(null);

    // 채널 입장 처리
    joinChannel(channelId, username)
      .then(() => {
        // 최근 메시지 가져오기
        return fetchRecentMessages(channelId);
      })
      .then((messages) => {
        // 메시지를 스토어에 설정
        useChatStore.getState().setMessages(channelId, messages);
        
        // SSE 연결 시작
        const apiUrl = `/api/sse?channelId=${encodeURIComponent(channelId)}`;
        const eventSource = new EventSource(apiUrl);
        
        // 연결 성공 이벤트
        eventSource.addEventListener('connected', () => {
          setConnected(true);
          setConnecting(false);
        });
        
        // 메시지 수신 이벤트
        eventSource.addEventListener('message', (event) => {
          try {
            const message = JSON.parse(event.data) as ChatMessage;
            addMessage(channelId, message);
          } catch (error) {
            console.error('메시지 파싱 오류:', error);
          }
        });
        
        // 사용자 목록 업데이트 이벤트
        eventSource.addEventListener('users', (event) => {
          try {
            const users = JSON.parse(event.data) as string[];
            setChannelUsers(channelId, users);
          } catch (error) {
            console.error('사용자 목록 파싱 오류:', error);
          }
        });
        
        // 오류 발생 시
        eventSource.addEventListener('error', () => {
          setConnectionError('서버와의 연결이 끊어졌습니다.');
          setConnected(false);
          setConnecting(false);
          eventSource.close();
        });
        
        // 참조 저장
        eventSourceRef.current = eventSource;
      })
      .catch((error) => {
        setConnectionError(`연결 오류: ${error.message}`);
        setConnected(false);
        setConnecting(false);
      });

    // 컴포넌트 언마운트 또는 채널/사용자 변경 시 정리
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      // 채널에서 퇴장 처리
      leaveChannel(channelId, username).catch((error) => {
        console.error('채널 퇴장 오류:', error);
      });
      
      setConnected(false);
    };
  }, [channelId, username]);
}

// 채널에 입장하는 함수
export async function joinChannel(channelId: string, username: string): Promise<string[]> {
  const response = await fetch('/api/channels', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channelId,
      username,
      action: 'join',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '채널 입장에 실패했습니다.');
  }

  const data = await response.json();
  return data.users;
}

// 채널에서 퇴장하는 함수
export async function leaveChannel(channelId: string, username: string): Promise<void> {
  await fetch('/api/channels', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channelId,
      username,
      action: 'leave',
    }),
  });
}

// 채널의 최근 메시지를 가져오는 함수
export async function fetchRecentMessages(channelId: string, limit = 20): Promise<ChatMessage[]> {
  const response = await fetch(`/api/messages?channelId=${encodeURIComponent(channelId)}&limit=${limit}`);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '메시지를 가져오는 데 실패했습니다.');
  }

  const data = await response.json();
  return data.messages || [];
}

// 메시지를 전송하는 함수
export async function sendMessage(channelId: string, content: string, username: string): Promise<ChatMessage> {
  const response = await fetch('/api/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channelId,
      content,
      username,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '메시지 전송에 실패했습니다.');
  }

  const data = await response.json();
  return data.message;
}

// 사용자 활동을 유지하는 함수 (5분마다 호출)
export function useKeepAlive(channelId: string, username: string) {
  useEffect(() => {
    if (!channelId || !username) return;

    // 첫 번째 활동 핑
    joinChannel(channelId, username).catch(console.error);
    
    // 주기적으로 활동 핑을 보내는 인터벌
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        joinChannel(channelId, username).catch(console.error);
      }
    }, 4 * 60 * 1000); // 4분마다 (5분 비활성 임계값보다 짧게)
    
    return () => clearInterval(interval);
  }, [channelId, username]);
}

// 채널 목록을 가져오는 함수
export async function fetchChannels(): Promise<Array<{ id: string; name: string; userCount: number }>> {
  const response = await fetch('/api/channels');
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '채널 목록을 가져오는 데 실패했습니다.');
  }

  const data = await response.json();
  return data.channels || [];
}

// 메시지 아이디 생성 함수
export function generateMessageId(): string {
  return uuidv4();
}