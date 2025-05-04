'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { MessageInput } from '@/components/chat/message-input';
import { ChatMessageItem } from '@/components/chat/message';
import { Sidebar } from '@/components/chat/sidebar';
import { ErrorFallback } from '@/components/ui/error-fallback';
import { ChatMessage, ChatChannel } from '@/lib/types';
import { loadChannelMessages, saveChannelMessages } from '@/lib/utils';

// 기본 채널 목록 (실제로는 API를 통해 가져올 수 있음)
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef<boolean>(true);

  // 로컬 스토리지에서 채팅 로그 불러오기
  useEffect(() => {
    if (typeof window !== 'undefined' && isInitialLoadRef.current) {
      const savedMessages = loadChannelMessages(channelId);
      if (savedMessages.length > 0) {
        setMessages(savedMessages);
        isInitialLoadRef.current = false;
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
      saveChannelMessages(channelId, messages);
    }
  }, [messages, channelId]);

  // SSE 연결 설정
  const connectSSE = () => {
    setIsConnecting(true);
    setConnectionError(null);
    
    const userId = localStorage.getItem('chat_user_id') || uuidv4();
    localStorage.setItem('chat_user_id', userId);
    
    // 이전 EventSource 정리
    if (eventSource) {
      eventSource.close();
    }
    
    // SSE 연결
    const newEventSource = new EventSource(`/api/chat/sse?channel=${channelId}`);
    
    newEventSource.onopen = () => {
      setIsConnected(true);
      setIsConnecting(false);
      console.log('SSE 연결 완료');
      
      // 초기 로딩이 아닌 경우에만 입장 메시지 전송
      if (!isInitialLoadRef.current) {
        // 입장 메시지
        const joinMessage: ChatMessage = {
          id: uuidv4(),
          channel: channelId,
          sender: 'system',
          content: `<em>${username}님이 채팅방에 입장했습니다.</em>`,
          timestamp: Date.now(),
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
      } else {
        isInitialLoadRef.current = false;
      }
    };
    
    newEventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ChatMessage;
        setMessages((prevMessages) => {
          // 중복 메시지 방지 (ID가 같은 메시지는 추가하지 않음)
          const isDuplicate = prevMessages.some(msg => msg.id === data.id);
          if (isDuplicate) {
            return prevMessages;
          }
          return [...prevMessages, data];
        });
      } catch (error) {
        console.error('메시지 파싱 에러:', error);
      }
    };
    
    newEventSource.onerror = (error) => {
      console.error('SSE 에러:', error);
      setIsConnected(false);
      setIsConnecting(false);
      setConnectionError('서버와의 연결이 끊어졌습니다. 다시 연결을 시도합니다.');
      newEventSource.close();
      
      // 재연결 시도
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      reconnectTimeoutRef.current = setTimeout(() => {
        connectSSE();
      }, 5000); // 5초 후 재시도
    };
    
    setEventSource(newEventSource);
  };

  // 컴포넌트 마운트 시 SSE 연결
  useEffect(() => {
    connectSSE();
    
    // 컴포넌트 언마운트 시 정리
    return () => {
      if (eventSource) {
        eventSource.close();
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      // 페이지를 완전히 떠날 때만 퇴장 메시지 전송
      const isNavigatingAway = !document.hidden;
      if (isNavigatingAway) {
        // 퇴장 메시지
        const leaveMessage: ChatMessage = {
          id: uuidv4(),
          channel: channelId,
          sender: 'system',
          content: `<em>${username}님이 채팅방에서 나갔습니다.</em>`,
          timestamp: Date.now(),
        };
        
        // 서버에 퇴장 메시지 보내기
        fetch('/api/chat/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            channel: channelId,
            message: leaveMessage,
          }),
        }).catch(error => {
          console.error('퇴장 메시지 전송 에러:', error);
        });
      }
    };
  }, [channelId, username]);

  // 메시지 전송
  const handleSendMessage = async (content: string) => {
    if (!isConnected) return;
    
    const newMessage: ChatMessage = {
      id: uuidv4(),
      channel: channelId,
      sender: username,
      content,
      timestamp: Date.now(),
    };
    
    try {
      await fetch('/api/chat/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: channelId,
          message: newMessage,
        }),
      });
      
      // 메시지 전송 후 로컬에 바로 추가 (즉시 반영)
      setMessages(prev => [...prev, newMessage]);
    } catch (error) {
      console.error('메시지 전송 에러:', error);
      alert('메시지 전송에 실패했습니다. 다시 시도해주세요.');
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
          <span>연결 중...</span>
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
        />
      </div>
    </div>
  );
}