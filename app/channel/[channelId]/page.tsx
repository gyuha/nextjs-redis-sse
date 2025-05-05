'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useChatStore } from '@/lib/store'
import { useSSEConnection, useKeepAlive, sendMessage, leaveChannel } from '@/lib/chat'
import ChannelSidebar from '@/components/sidebar/channel-sidebar'
import MessageList from '@/components/chat/message-list'
import MessageInput from '@/components/chat/message-input'
import { Separator } from '@/components/ui/separator'
import { Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { use } from 'react'

interface ChannelPageProps {
  params: {
    channelId: string
  }
}

export default function ChannelPage({ params }: ChannelPageProps) {
  const router = useRouter()
  const unwrappedParams = use(params)
  console.log('📢[page.tsx:24]: unwrappedParams: ', unwrappedParams);
  const { channelId } = unwrappedParams
  const decodedChannelId = decodeURIComponent(channelId)
  
  const { 
    username, 
    isLoggedIn, 
    currentChannelId,
    setCurrentChannelId,
    messages,
    channelUsers,
    isConnected,
    isConnecting,
    connectionError
  } = useChatStore()
  
  const [isSwitchingChannel, setIsSwitchingChannel] = useState(false)
  
  // 로그인 상태 확인
  useEffect(() => {
    if (!isLoggedIn || !username) {
      router.push('/')
    } else {
      setCurrentChannelId(decodedChannelId)
    }
  }, [isLoggedIn, username, router, decodedChannelId, setCurrentChannelId])
  
  // SSE 연결 설정
  useSSEConnection(decodedChannelId, username)
  
  // 활성 상태 유지 (5분 비활성 타임아웃 방지)
  useKeepAlive(decodedChannelId, username)

  // 메시지 전송 핸들러
  const handleSendMessage = async (content: string) => {
    if (!content.trim() || !decodedChannelId || !username) return
    
    try {
      // API를 통해 메시지 전송
      await sendMessage(decodedChannelId, content.trim(), username)
    } catch (error) {
      console.error('메시지 전송 오류:', error)
    }
  }
  
  // 채널 전환 핸들러
  const handleChangeChannel = async (newChannelId: string) => {
    if (newChannelId !== decodedChannelId) {
      setIsSwitchingChannel(true);
      try {
        console.log(`${decodedChannelId} 채널에서 ${newChannelId} 채널로 전환 시작`);
        
        // 현재 채널에서 퇴장하는 과정이 완전히 완료되도록 함
        const leavePromise = leaveChannel(decodedChannelId, username);
        
        try {
          // 퇴장 요청이 완료될 때까지 기다리고 응답을 기록
          await leavePromise;
          console.log(`${decodedChannelId} 채널에서 퇴장 완료`);
        } catch (leaveError) {
          console.error(`${decodedChannelId} 채널 퇴장 중 오류:`, leaveError);
        }
        
        // 약간의 지연 시간을 줘서 서버 측 리소스 정리를 완료할 시간을 확보
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 새로운 채널로 이동
        console.log(`${newChannelId} 채널로 이동`);
        router.push(`/channel/${encodeURIComponent(newChannelId)}`);
      } finally {
        // 타임아웃으로 채널 전환 블록 상태를 해제 (안전성 확보)
        setTimeout(() => {
          if (setIsSwitchingChannel) setIsSwitchingChannel(false);
        }, 3000);
      }
    }
  }
  
  // 현재 채널의 메시지와 사용자 목록
  const currentMessages = messages[decodedChannelId] || []
  const currentUsers = channelUsers[decodedChannelId] || []

  // 로그인하지 않은 경우 로딩 표시
  if (!isLoggedIn || !username) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">로그인 상태를 확인 중...</span>
      </div>
    )
  }

  // UI 블록 처리
  if (isSwitchingChannel) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">채널을 이동 중입니다...</span>
      </div>
    )
  }

  return (
    <div className="flex h-screen">
      {/* 채널 사이드바 */}
      <ChannelSidebar
        currentChannelId={decodedChannelId}
        onChannelChange={handleChangeChannel}
      />
      
      {/* 메인 채팅 영역 */}
      <div className="flex flex-col flex-1 h-full">
        {/* 채널 정보 헤더 */}
        <div className="p-4 bg-card border-b flex justify-between items-center">
          <div>
            <h1 className="text-lg font-medium">{decodedChannelId} 채널</h1>
            <p className="text-sm text-muted-foreground">
              접속자 {currentUsers.length}명
            </p>
          </div>
          
          {/* 연결 상태 표시 */}
          <div className="flex items-center">
            {isConnecting && (
              <div className="flex items-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                <span className="text-sm">연결 중...</span>
              </div>
            )}
            
            {isConnected && !isConnecting && (
              <div className="flex items-center text-green-600 dark:text-green-400">
                <div className="h-2 w-2 rounded-full bg-green-600 dark:bg-green-400 mr-1" />
                <span className="text-sm">연결됨</span>
              </div>
            )}
            
            {!isConnected && !isConnecting && (
              <div className="flex items-center text-red-600 dark:text-red-400">
                <div className="h-2 w-2 rounded-full bg-red-600 dark:bg-red-400 mr-1" />
                <span className="text-sm">연결 끊김</span>
              </div>
            )}
          </div>
        </div>
        
        {/* 연결 오류 표시 */}
        {connectionError && (
          <Alert variant="destructive" className="m-4">
            <AlertDescription>
              {connectionError}
            </AlertDescription>
          </Alert>
        )}
        
        {/* 메시지 목록 */}
        <div className="flex-1 overflow-hidden">
          <MessageList 
            messages={currentMessages} 
            currentUser={username}
          />
        </div>
        
        <Separator />
        
        {/* 메시지 입력 */}
        <div className="p-4">
          <MessageInput 
            onSendMessage={handleSendMessage} 
            isDisabled={!isConnected}
          />
        </div>
      </div>
      
      {/* 사용자 목록 사이드바 */}
      <div className="w-60 border-l bg-card hidden md:block">
        <div className="p-4 border-b">
          <h2 className="font-medium">접속자 목록</h2>
        </div>
        <div className="p-2">
          {currentUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground p-2">접속자가 없습니다.</p>
          ) : (
            <ul className="space-y-1">
              {currentUsers.map((user) => (
                <li 
                  key={user}
                  className={`px-2 py-1 rounded text-sm ${
                    user === username ? 'bg-accent text-accent-foreground font-medium' : ''
                  }`}
                >
                  {user} {user === username && '(나)'}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}