import { useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useChatStore } from './store';
import { ChatMessage } from './pubsub';

// SSE 연결 관리 훅
export function useSSEConnection(channelId: string, username: string) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const cleanupInProgressRef = useRef<boolean>(false);
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

    // 이미 정리 작업이 진행 중이면 새 연결을 시작하지 않음
    if (cleanupInProgressRef.current) {
      console.log('이전 연결의 정리 작업이 진행 중입니다. 잠시 후 다시 시도합니다.');
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

    let isAborted = false; // 현재 effect가 취소됐는지 추적

    // 채널 입장 처리
    joinChannel(channelId, username)
      .then(() => {
        if (isAborted) return Promise.reject(new Error('Connection aborted'));
        // 최근 메시지 가져오기
        return fetchRecentMessages(channelId);
      })
      .then((messages) => {
        if (isAborted) return;
        // 메시지를 스토어에 설정
        useChatStore.getState().setMessages(channelId, messages);
        
        // SSE 연결 시작
        const apiUrl = `/api/sse?channelId=${encodeURIComponent(channelId)}&username=${encodeURIComponent(username)}`;
        const eventSource = new EventSource(apiUrl);
        
        // 연결 성공 이벤트
        eventSource.addEventListener('connected', () => {
          if (isAborted) {
            eventSource.close();
            return;
          }
          setConnected(true);
          setConnecting(false);
        });
        
        // 메시지 수신 이벤트
        eventSource.addEventListener('message', (event) => {
          try {
            if (isAborted) return;
            const message = JSON.parse(event.data) as ChatMessage;
            addMessage(channelId, message);
          } catch (error) {
            console.error('메시지 파싱 오류:', error);
          }
        });
        
        // 사용자 목록 업데이트 이벤트
        eventSource.addEventListener('users', (event) => {
          try {
            if (isAborted) return;
            const users = JSON.parse(event.data) as string[];
            setChannelUsers(channelId, users);
          } catch (error) {
            console.error('사용자 목록 파싱 오류:', error);
          }
        });
        
        // 오류 발생 시
        eventSource.addEventListener('error', () => {
          if (isAborted) return;
          setConnectionError('서버와의 연결이 끊어졌습니다.');
          setConnected(false);
          setConnecting(false);
          eventSource.close();
        });
        
        // 참조 저장
        eventSourceRef.current = eventSource;
      })
      .catch((error) => {
        if (isAborted) return;
        setConnectionError(`연결 오류: ${error.message}`);
        setConnected(false);
        setConnecting(false);
      });

    // 컴포넌트 언마운트 또는 채널/사용자 변경 시 정리
    return () => {
      isAborted = true; // 현재 effect 취소 표시
      cleanupInProgressRef.current = true; // 정리 작업 진행 중임을 표시
      
      // 비동기 정리 작업 시작
      const cleanup = async () => {
        console.log(`채널 ${channelId} 연결 정리 시작`);
        
        // SSE 연결 종료
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        
        try {
          // 채널에서 퇴장 처리 - 반드시 await 사용
          await leaveChannel(channelId, username);
          console.log(`채널 ${channelId}에서 성공적으로 퇴장했습니다.`);
        } catch (error) {
          console.error(`채널 ${channelId} 퇴장 오류:`, error);
        } finally {
          // 연결 상태 초기화
          setConnected(false);
          // 정리 작업 완료 표시
          cleanupInProgressRef.current = false;
          console.log(`채널 ${channelId} 연결 정리 완료`);
        }
      };
      
      // 정리 작업 시작 - 완료를 기다리지는 않지만 작업은 시작됨
      cleanup();
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