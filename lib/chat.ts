import { useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useChatStore } from './store';
import { ChatMessage } from './pubsub';

// SSE 연결 관리 훅
export function useSSEConnection(channelId: string, username: string) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const cleanupInProgressRef = useRef<boolean>(false);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionStateRef = useRef<string>('idle'); // 'idle', 'connecting', 'connected', 'error'
  const reconnectAttemptsRef = useRef<number>(0);
  const {
    setConnected,
    setConnecting,
    setConnectionError,
    addMessage,
    setChannelUsers,
  } = useChatStore();

  // 연결 함수 - 재시도 로직을 포함
  const establishConnection = useRef(async (abortController: AbortController) => {
    if (abortController.signal.aborted) return;
    
    // 이미 연결된 상태라면 다시 시도하지 않음
    if (connectionStateRef.current === 'connected') return;
    
    // 연결 중이라면 타임아웃을 설정하여 일정 시간이 지나면 다시 시도
    if (connectionStateRef.current === 'connecting') {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      
      // 10초 후에 다시 시도
      connectionTimeoutRef.current = setTimeout(() => {
        console.log(`채널 ${channelId} 연결 시간 초과, 재시도 중...`);
        connectionStateRef.current = 'idle';
        establishConnection.current(abortController);
      }, 10000);
      
      return;
    }
    
    if (!channelId || !username) return;
    connectionStateRef.current = 'connecting';
    setConnecting(true);
    setConnectionError(null);
    
    try {
      // 재연결 시도를 제한 (최대 5번)
      if (reconnectAttemptsRef.current >= 5) {
        setConnectionError('연결 시도 횟수가 초과되었습니다. 페이지를 새로고침해 주세요.');
        connectionStateRef.current = 'error';
        setConnecting(false);
        return;
      }
      
      reconnectAttemptsRef.current += 1;
      
      // 채널 입장 처리
      await joinChannel(channelId, username);
      if (abortController.signal.aborted) return;
      
      // 최근 메시지 가져오기
      const messages = await fetchRecentMessages(channelId);
      if (abortController.signal.aborted) return;
      
      // 메시지를 스토어에 설정
      useChatStore.getState().setMessages(channelId, messages);
      
      // 이전 연결 종료
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      // SSE 연결 시작
      const apiUrl = `/api/sse?channelId=${encodeURIComponent(channelId)}&username=${encodeURIComponent(username)}`;
      const eventSource = new EventSource(apiUrl);
      eventSourceRef.current = eventSource;
      
      // 연결 성공 이벤트
      eventSource.addEventListener('connected', () => {
        if (abortController.signal.aborted) {
          eventSource.close();
          return;
        }
        
        console.log(`채널 ${channelId}에 성공적으로 연결됨`);
        reconnectAttemptsRef.current = 0; // 연결 성공하면 재시도 카운트 초기화
        connectionStateRef.current = 'connected';
        setConnected(true);
        setConnecting(false);
      });
      
      // 메시지 수신 이벤트
      eventSource.addEventListener('message', (event) => {
        try {
          if (abortController.signal.aborted) return;
          const message = JSON.parse(event.data) as ChatMessage;
          addMessage(channelId, message);
        } catch (error) {
          console.error('메시지 파싱 오류:', error);
        }
      });
      
      // 사용자 목록 업데이트 이벤트
      eventSource.addEventListener('users', (event) => {
        try {
          if (abortController.signal.aborted) return;
          const users = JSON.parse(event.data) as string[];
          setChannelUsers(channelId, users);
        } catch (error) {
          console.error('사용자 목록 파싱 오류:', error);
        }
      });
      
      // 오류 발생 시
      eventSource.addEventListener('error', (err) => {
        if (abortController.signal.aborted) return;
        
        console.error(`채널 ${channelId} 연결 오류:`, err);
        connectionStateRef.current = 'error';
        setConnected(false);
        setConnecting(false);
        setConnectionError('서버와의 연결이 끊어졌습니다. 재연결 중...');
        
        // 연결 오류 시 EventSource 정리
        eventSource.close();
        eventSourceRef.current = null;
        
        // 3초 후 재연결 시도
        setTimeout(() => {
          if (!abortController.signal.aborted) {
            console.log(`채널 ${channelId} 재연결 시도...`);
            connectionStateRef.current = 'idle'; // 상태를 idle로 리셋
            establishConnection.current(abortController);
          }
        }, 3000);
      });
      
      // 연결 시작 후 30초 내에 connected 이벤트가 발생하지 않으면 재시도
      connectionTimeoutRef.current = setTimeout(() => {
        if (connectionStateRef.current !== 'connected' && !abortController.signal.aborted) {
          console.log(`채널 ${channelId} 연결 타임아웃, 재시도 중...`);
          
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
          
          connectionStateRef.current = 'idle';
          establishConnection.current(abortController);
        }
      }, 30000);
      
    } catch (error) {
      if (abortController.signal.aborted) return;
      
      console.error(`채널 ${channelId} 연결 시도 중 오류:`, error);
      connectionStateRef.current = 'error';
      setConnectionError(`연결 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
      setConnected(false);
      setConnecting(false);
      
      // 5초 후 재연결 시도
      setTimeout(() => {
        if (!abortController.signal.aborted) {
          console.log(`채널 ${channelId} 재연결 시도...`);
          connectionStateRef.current = 'idle';
          establishConnection.current(abortController);
        }
      }, 5000);
    }
  }).current;

  useEffect(() => {
    // 채널 ID나 사용자 이름이 없으면 연결하지 않음
    if (!channelId || !username) {
      setConnectionError('채널 ID와 사용자 이름이 필요합니다.');
      return;
    }

    console.log(`[SSE] 채널 ${channelId}에 연결 시도 시작, 사용자: ${username}`);
    
    // 값이 변경될 때마다 상태를 초기화
    reconnectAttemptsRef.current = 0;
    connectionStateRef.current = 'idle';
    
    // cleanup 진행 중 플래그를 리셋
    cleanupInProgressRef.current = false;
    
    // 연결 취소를 위한 AbortController
    const abortController = new AbortController();
    
    // 연결 시작
    establishConnection(abortController);
    
    // 타이머 정리 및 연결 종료 함수
    return () => {
      console.log(`채널 ${channelId} useEffect cleanup 시작`);
      
      abortController.abort(); // 진행 중인 연결 시도 취소
      
      // 타임아웃 정리
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      
      // SSE 연결 종료
      if (eventSourceRef.current) {
        console.log(`채널 ${channelId}의 SSE 연결 종료`);
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      // 연결 상태 초기화
      connectionStateRef.current = 'idle';
      
      // 비동기 정리 작업 시작 (채널 퇴장 처리)
      const performCleanup = async () => {
        cleanupInProgressRef.current = true;
        
        try {
          console.log(`채널 ${channelId}에서 퇴장 요청 시작`);
          await leaveChannel(channelId, username);
          console.log(`채널 ${channelId}에서 퇴장 완료`);
        } catch (error) {
          console.error(`채널 ${channelId} 퇴장 처리 중 오류:`, error);
        } finally {
          // 상태 초기화
          setConnected(false);
          cleanupInProgressRef.current = false;
          console.log(`채널 ${channelId} 정리 작업 완료`);
        }
      };
      
      // cleanup 실행 - 비동기지만, 즉시 시작
      performCleanup();
    };
  }, [channelId, username, setConnected, setConnecting, setConnectionError, addMessage, setChannelUsers]);
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
export async function fetchChannels(retryCount = 0, maxRetries = 3): Promise<Array<{ id: string; name: string; userCount: number }>> {
  try {
    // 첫 번째 시도에서만 로그 출력
    if (retryCount === 0) {
      console.log('채널 목록 가져오기 시도...');
    } else {
      console.log(`채널 목록 가져오기 재시도 ${retryCount}/${maxRetries}...`);
    }
    
    // 타임아웃 설정 - AbortController와 함께 타임아웃 설정
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10초 타임아웃
    
    const response = await fetch('/api/channels', {
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '채널 목록 요청 실패' }));
      throw new Error(error.error || `HTTP 오류: ${response.status}`);
    }

    const data = await response.json();
    console.log('채널 목록 가져오기 성공:', data.channels?.length || 0, '개의 채널');
    return data.channels || [];
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.error('채널 목록 가져오기 타임아웃');
    } else {
      console.error('채널 목록 가져오기 오류:', error);
    }
    
    // 최대 재시도 횟수 이내라면 재시도
    if (retryCount < maxRetries) {
      console.log(`재시도 ${retryCount + 1}/${maxRetries} 시작 (1초 후)...`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기 후 재시도
      return fetchChannels(retryCount + 1, maxRetries);
    }
    
    // 기본 채널 목록 제공 - 최후의 대안
    if (retryCount >= maxRetries) {
      console.warn('채널 목록 가져오기 최대 재시도 횟수 초과, 기본 채널 사용');
      return [
        { id: 'general', name: '일반', userCount: 0 },
        { id: 'random', name: '랜덤', userCount: 0 },
        { id: 'help', name: '도움말', userCount: 0 }
      ];
    }
    
    throw error;
  }
}

// 메시지 아이디 생성 함수
export function generateMessageId(): string {
  return uuidv4();
}