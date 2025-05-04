'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { MessageInput } from '@/components/chat/message-input';
import { ChatMessageItem } from '@/components/chat/message';
import { Sidebar } from '@/components/chat/sidebar';
import { ErrorFallback } from '@/components/ui/error-fallback';
import { ChatMessage, ChatChannel } from '@/lib/types';
import { loadChannelMessages, saveChannelMessages } from '@/lib/utils';

// 기본 채널 목록
const defaultChannels: ChatChannel[] = [
  { id: 'general', name: '일반' },
  { id: 'random', name: '랜덤' },
  { id: 'help', name: '도움말' },
  { id: 'announcements', name: '공지사항' },
];

interface PageProps {
  params: {
    channelId: string;
  };
}

export default function ChannelPage({ params }: PageProps) {
  const { channelId } = params;
  const searchParams = useSearchParams();
  const username = searchParams?.get('username') || '익명';
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const [inputValue, setInputValue] = useState(''); // 누락된 상태 추가
  const [error, setError] = useState<string | null>(null); // 누락된 오류 상태 추가
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectCountRef = useRef<number>(0);
  const isInitialLoadRef = useRef<boolean>(true);
  const lastMessageIdRef = useRef<string | null>(null);
  const prevChannelRef = useRef<string | null>(null);
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null); // 하트비트 타임아웃 추가
  const pingTimeRef = useRef<number>(Date.now()); // 마지막 핑 시간 추적

  // 채널 변경 감지 및 메시지 초기화
  useEffect(() => {
    // 채널이 변경되었는지 확인
    if (prevChannelRef.current && prevChannelRef.current !== channelId) {
      // 이전 EventSource 정리
      if (eventSource) {
        console.log(`채널 변경: ${prevChannelRef.current} -> ${channelId}, 이전 SSE 연결 종료`);
        eventSource.close();
        setEventSource(null);
      }
      
      // 메시지 상태 초기화
      setMessages([]);
      setError(null); // 오류 상태 초기화
      
      // 재연결 시도 중지
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // 하트비트 타임아웃 정리
      if (heartbeatTimeoutRef.current) {
        clearTimeout(heartbeatTimeoutRef.current);
        heartbeatTimeoutRef.current = null;
      }
      
      // 재연결 카운터 초기화
      reconnectCountRef.current = 0;
      
      // 초기 로드 상태 활성화
      isInitialLoadRef.current = true;
    }
    
    // 현재 채널 저장
    prevChannelRef.current = channelId;
  }, [channelId, eventSource]);

  // 로컬 스토리지에서 채팅 로그 불러오기
  useEffect(() => {
    // 채널이 변경되면 로컬 스토리지에서 새 채널 메시지를 불러옴
    if (typeof window !== 'undefined') {
      try {
        const savedMessages = loadChannelMessages(channelId);
        if (savedMessages.length > 0) {
          setMessages(savedMessages);
          // 마지막 메시지 ID 추적
          const lastMessage = savedMessages[savedMessages.length - 1];
          if (lastMessage) {
            lastMessageIdRef.current = lastMessage.id;
          }
        } else {
          // 저장된 메시지가 없으면 빈 배열로 초기화
          setMessages([]);
        }
      } catch (error) {
        console.error('채팅 로그 로드 중 오류:', error);
        setMessages([]);
      }
    }
  }, [channelId]);

  // 메시지 자동 스크롤
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
    
    // 메시지가 변경될 때마다 로컬 스토리지에 저장
    if (messages.length > 0 && !isInitialLoadRef.current) {
      try {
        saveChannelMessages(channelId, messages);
      } catch (error) {
        console.error('메시지 저장 중 오류:', error);
      }
    }
  }, [messages, channelId]);

  // SSE 메시지 처리 핸들러
  const handleEventSourceMessage = useCallback((e: MessageEvent) => {
    try {
      // 빈 메시지 무시
      if (!e.data || e.data === '') return;
      
      // 하트비트 메시지 시간 업데이트
      pingTimeRef.current = Date.now();
      
      let parsedData;
      try {
        parsedData = JSON.parse(e.data);
      } catch (jsonError) {
        console.error('SSE 메시지 파싱 오류:', jsonError, '메시지:', e.data);
        return;
      }
      
      // 핑 메시지 처리
      if (parsedData.type === 'ping') {
        pingTimeRef.current = Date.now();
        return;
      }
      
      // 오류 메시지 처리
      if (parsedData.type === 'error') {
        setError(parsedData.message || '서버에서 오류가 발생했습니다.');
        return;
      }
      
      // 재연결 메시지 처리
      if (parsedData.type === 'reconnect') {
        console.log('서버에 재연결되었습니다:', parsedData.message);
        setIsConnected(true);
        return;
      }
      
      // 연결 메시지 처리
      if (parsedData.type === 'connect') {
        console.log('서버에 연결되었습니다:', parsedData.message);
        setIsConnected(true);
        return;
      }
      
      // 메시지 검증
      if (!parsedData.id || !parsedData.channel) {
        console.error('SSE 메시지 형식 오류: 필수 필드 누락', parsedData);
        return;
      }
      
      // 다른 채널의 메시지는 무시
      if (parsedData.channel !== channelId) {
        return;
      }
      
      // 중복 메시지 확인 후 추가
      if (!messages.some(msg => msg.id === parsedData.id)) {
        setMessages(prev => [...prev, parsedData]);
        lastMessageIdRef.current = parsedData.id;
      }
    } catch (error) {
      console.error('SSE 메시지 처리 오류:', error);
    }
  }, [messages, channelId]);

  // 하트비트 체커 설정
  const setupHeartbeatChecker = useCallback(() => {
    // 기존 타임아웃 정리
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
    }
    
    // 60초 동안 메시지가 없으면 연결 끊김으로 간주
    heartbeatTimeoutRef.current = setTimeout(() => {
      const lastPingDuration = Date.now() - pingTimeRef.current;
      console.log(`마지막 핑으로부터 ${lastPingDuration}ms 경과`);
      
      if (lastPingDuration > 60000) { // 60초
        console.log('서버로부터 60초 이상 메시지가 없어 연결을 재설정합니다.');
        setIsConnected(false);
        
        if (eventSource) {
          eventSource.close();
          setEventSource(null);
        }
        
        // 재연결 시도
        connectSSE();
      } else {
        // 다시 체크 설정
        setupHeartbeatChecker();
      }
    }, 30000); // 30초마다 체크
  }, [eventSource]);

  // SSE 연결 설정
  const connectSSE = useCallback(() => {
    // 이미 연결 중인 경우 중복 연결 방지
    if (isConnecting && eventSource) {
      console.log('이미 SSE 연결이 시도 중입니다.');
      return;
    }
    
    console.log(`채널 ${channelId}에 대한 SSE 연결 시작`);
    
    setIsConnecting(true);
    setConnectionError(null);
    
    // 이전 EventSource 정리
    if (eventSource) {
      console.log('이전 SSE 연결 종료');
      eventSource.close();
    }
    
    // 하트비트 타임아웃 정리
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
    }
    
    try {
      // 고유 사용자 ID 저장 또는 생성
      const userId = localStorage.getItem('chat_user_id') || uuidv4();
      localStorage.setItem('chat_user_id', userId);
      
      // 핑 시간 초기화
      pingTimeRef.current = Date.now();
      
      // SSE 연결
      const newEventSource = new EventSource(`/api/chat/sse?channel=${channelId}&userId=${userId}`);
      
      // 연결 성공 이벤트
      newEventSource.onopen = () => {
        console.log(`채널 ${channelId}에 SSE 연결 성공`);
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        reconnectCountRef.current = 0;
        pingTimeRef.current = Date.now();
        
        // 초기 로딩이 아닌 경우에만 입장 메시지 전송
        if (!isInitialLoadRef.current) {
          sendJoinMessage();
        } else {
          isInitialLoadRef.current = false;
        }
        
        // 하트비트 체커 설정
        setupHeartbeatChecker();
      };
      
      // 메시지 수신 이벤트
      newEventSource.onmessage = handleEventSourceMessage;
      
      // 오류 이벤트
      newEventSource.onerror = (error) => {
        console.error('SSE 에러:', error);
        
        // 다른 채널로 이미 이동했다면 에러 무시
        if (prevChannelRef.current !== channelId) {
          console.log('채널이 변경되어 SSE 에러를 무시합니다.');
          newEventSource.close();
          return;
        }
        
        setIsConnected(false);
        setIsConnecting(false);
        setConnectionError('서버와의 연결이 끊어졌습니다. 다시 연결을 시도합니다.');
        newEventSource.close();
        
        // 재연결 시도
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        
        // 최대 재시도 횟수 제한 (20번)
        if (reconnectCountRef.current < 20) {
          // 지수 백오프 적용 (최대 30초)
          const delay = Math.min(1000 * Math.pow(1.5, reconnectCountRef.current), 30000);
          console.log(`${delay}ms 후 재연결 시도 예정 (${reconnectCountRef.current + 1}/20)`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            // 채널이 그대로인 경우에만 재연결
            if (prevChannelRef.current === channelId) {
              reconnectCountRef.current++;
              console.log(`채널 ${channelId}에 대한 SSE 재연결 시도 (${reconnectCountRef.current}/20)`);
              connectSSE();
            }
          }, delay);
        } else {
          setConnectionError('서버 연결에 실패했습니다. 페이지를 새로고침하거나 나중에 다시 시도해주세요.');
        }
      };
      
      setEventSource(newEventSource);
    } catch (error) {
      console.error('SSE 연결 생성 중 오류:', error);
      setIsConnecting(false);
      setConnectionError('서버 연결을 초기화하는 중 오류가 발생했습니다.');
    }
  }, [channelId, handleEventSourceMessage, isConnecting, eventSource, setupHeartbeatChecker]);

  // 입장 메시지 전송 함수
  const sendJoinMessage = useCallback(() => {
    const joinMessage: ChatMessage = {
      id: uuidv4(),
      channel: channelId,
      sender: 'system',
      content: `<em>${username}님이 채팅방에 입장했습니다.</em>`,
      timestamp: Date.now(),
      type: 'system',
    };
    
    // 서버에 입장 메시지 보내기
    fetch('/api/chat/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        message: joinMessage,
      }),
    }).catch(error => {
      console.error('입장 메시지 전송 에러:', error);
    });
  }, [channelId, username]);
  
  // 퇴장 메시지 전송 함수
  const sendLeaveMessage = useCallback(() => {
    // 연결이 활성화된 경우에만 퇴장 메시지 전송
    if (!isConnected) return;
    
    const leaveMessage: ChatMessage = {
      id: uuidv4(),
      channel: channelId,
      sender: 'system',
      content: `<em>${username}님이 채팅방에서 나갔습니다.</em>`,
      timestamp: Date.now(),
      type: 'system',
    };
    
    // 서버에 퇴장 메시지 보내기 (동기식 요청으로 페이지 종료 전에 전송 보장)
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/chat/send', false); // 동기식 요청
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({
        channel: channelId,
        message: leaveMessage,
      }));
    } catch (error) {
      console.error('퇴장 메시지 전송 에러:', error);
    }
  }, [channelId, username, isConnected]);

  // 컴포넌트 마운트 시 SSE 연결
  useEffect(() => {
    // 채널 변경 시마다 새로운 연결 설정
    connectSSE();
    
    // beforeunload 이벤트에 대한 핸들러 추가 (페이지 이탈 시)
    const handleBeforeUnload = () => {
      if (isConnected) {
        sendLeaveMessage();
      }
      
      // 하트비트 타임아웃 정리
      if (heartbeatTimeoutRef.current) {
        clearTimeout(heartbeatTimeoutRef.current);
      }
      
      // 재연결 타임아웃 정리
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // 컴포넌트 언마운트 또는 채널 변경 시 정리
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // 채널이 변경되거나 페이지를 벗어나는 경우 퇴장 메시지 전송
      if (isConnected && !document.hidden) {
        sendLeaveMessage();
      }
      
      // 현재 채널 EventSource 정리
      if (eventSource) {
        console.log(`채널 ${channelId}에서 나가며 SSE 연결 종료`);
        eventSource.close();
      }
      
      // 재연결 시도 중지
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // 하트비트 타임아웃 정리
      if (heartbeatTimeoutRef.current) {
        clearTimeout(heartbeatTimeoutRef.current);
        heartbeatTimeoutRef.current = null;
      }
    };
  }, [channelId, connectSSE, eventSource, sendLeaveMessage, isConnected]);

  // 메시지 전송 핸들러
  const handleSendMessage = async (newMessage: string) => {
    // 빈 메시지는 전송하지 않음
    if (!newMessage.trim()) return;
    
    try {
      // 메시지 객체 생성
      const messageObject: ChatMessage = {
        id: uuidv4(),
        channel: channelId,
        sender: username,
        content: newMessage.trim(),
        timestamp: Date.now(),
      };
      
      const requestBody = JSON.stringify({
        channel: channelId,
        message: messageObject,
      });
      
      // 서버에 메시지 전송
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: requestBody,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `서버 오류: ${response.status}`);
      }
      
      // 입력 필드 초기화
      setInputValue('');
      
    } catch (error) {
      console.error('메시지 전송 오류:', error);
      setError(`메시지를 보낼 수 없습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
      
      // 3초 후 오류 메시지 제거
      setTimeout(() => setError(null), 3000);
    }
  };

  // 채팅 로그 초기화
  const clearChatHistory = () => {
    if (window.confirm('채팅 기록을 모두 지우시겠습니까?')) {
      setMessages([]);
      saveChannelMessages(channelId, []);
      
      // 시스템 메시지 추가
      const clearMessage: ChatMessage = {
        id: uuidv4(),
        channel: channelId,
        sender: 'system',
        content: '<em>채팅 기록이 초기화되었습니다.</em>',
        timestamp: Date.now(),
        type: 'system',
      };
      
      setMessages([clearMessage]);
      
      // 서버에 알림 메시지 전송
      fetch('/api/chat/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: channelId,
          message: clearMessage,
        }),
      }).catch(console.error);
    }
  };

  // 현재 채널명 가져오기
  const currentChannel = defaultChannels.find((c) => c.id === channelId)?.name || channelId;

  // 연결 상태에 따른 UI 표시
  const renderConnectionStatus = () => {
    if (isConnecting) {
      return (
        <div className="flex items-center justify-center p-4 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">
          <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>서버에 연결 중...</span>
        </div>
      );
    }
    
    if (connectionError) {
      return (
        <div className="p-4 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300">
          <div className="flex items-center mb-2">
            <svg className="h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{connectionError}</span>
          </div>
          <button
            onClick={connectSSE}
            className="text-sm font-medium underline hover:text-red-800"
          >
            지금 다시 연결
          </button>
        </div>
      );
    }
    
    return null;
  };

  // 임시 오류 메시지
  const renderErrorToast = () => {
    if (!error) return null;
    
    return (
      <div className="fixed bottom-4 right-4 bg-red-500 text-white p-3 rounded-md shadow-lg z-50 max-w-md">
        <div className="flex items-center">
          <svg className="h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{error}</span>
        </div>
        <button 
          onClick={() => setError(null)} 
          className="absolute top-1 right-1 text-white"
          aria-label="닫기"
        >
          ✕
        </button>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-white dark:bg-gray-900">
      <Sidebar
        channels={defaultChannels}
        currentChannel={channelId}
        username={username}
      />
      
      <div className="flex-1 flex flex-col lg:ml-64">
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 py-4 px-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">#{currentChannel}</h1>
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <span className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                <span className="text-sm text-gray-500">
                  {isConnected ? '연결됨' : '연결 끊김'}
                </span>
              </div>
              <button 
                onClick={clearChatHistory}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                채팅 기록 지우기
              </button>
            </div>
          </div>
        </header>
        
        {renderConnectionStatus()}
        
        <main className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-950">
          {connectionError && !isConnected && !isConnecting && messages.length === 0 ? (
            <ErrorFallback 
              error={connectionError} 
              retry={connectSSE}
            />
          ) : (
            <div className="space-y-2">
              {messages.length > 0 ? (
                messages.map((message) => (
                  <ChatMessageItem
                    key={message.id}
                    message={message}
                    isCurrentUser={message.sender === username}
                  />
                ))
              ) : (
                <div className="text-center text-gray-500 my-20">
                  <p>아직 메시지가 없습니다.</p>
                  <p className="text-sm mt-2">첫 번째 메시지를 보내보세요!</p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>
        
        <MessageInput
          onSendMessage={handleSendMessage}
          disabled={!isConnected}
          value={inputValue}
          onChange={setInputValue}
        />
      </div>
      
      {renderErrorToast()}
    </div>
  );
}