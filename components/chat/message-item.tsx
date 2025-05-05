'use client'

import { useState } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ChatMessage } from '@/lib/pubsub'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

interface MessageItemProps {
  message: ChatMessage
  isCurrentUser: boolean
}

export default function MessageItem({ message, isCurrentUser }: MessageItemProps) {
  const [showDetails, setShowDetails] = useState(false)
  
  // 타입이 system인 경우 시스템 메시지로 처리
  const isSystemMessage = message.type === 'system'
  
  // 시간 포맷팅
  const formattedTime = format(new Date(message.timestamp), 'HH:mm')
  const formattedFullTime = format(
    new Date(message.timestamp), 
    'yyyy년 MM월 dd일 HH:mm:ss',
    { locale: ko }
  )
  
  // 유저 아바타 이니셜 생성
  const getUserInitial = (username: string) => {
    return username.charAt(0).toUpperCase()
  }
  
  // 사용자 이름에서 색상 생성 (고유한 컬러 지정)
  const getUserColor = (username: string) => {
    let hash = 0
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash)
    }
    
    const hue = Math.abs(hash % 360)
    // 파스텔 톤으로 설정 (채도와 명도 조정)
    return `hsl(${hue}, 70%, 80%)`
  }
  
  // 시스템 메시지 렌더링
  if (isSystemMessage) {
    return (
      <div className="flex justify-center py-2">
        <div className="px-3 py-1 text-xs bg-muted/50 rounded-full text-muted-foreground">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div 
      className={`flex items-start gap-3 ${isCurrentUser ? 'flex-row-reverse' : ''}`}
      onClick={() => setShowDetails(!showDetails)}
    >
      {/* 아바타 */}
      <Avatar className="h-8 w-8" style={{ backgroundColor: isCurrentUser ? 'hsl(210, 70%, 80%)' : getUserColor(message.username) }}>
        <AvatarFallback>{getUserInitial(message.username)}</AvatarFallback>
      </Avatar>
      
      <div className={`flex flex-col max-w-[80%] ${isCurrentUser ? 'items-end' : ''}`}>
        {/* 사용자 이름과 시간 */}
        <div className={`flex items-center gap-2 mb-1 ${isCurrentUser ? 'flex-row-reverse' : ''}`}>
          <span className="font-medium text-sm">
            {message.username}{isCurrentUser ? ' (나)' : ''}
          </span>
          <span className="text-xs text-muted-foreground">
            {formattedTime}
          </span>
        </div>
        
        {/* 메시지 내용 */}
        <div 
          className={`px-4 py-2 rounded-lg break-words ${
            isCurrentUser 
              ? 'bg-primary text-primary-foreground rounded-tr-none' 
              : 'bg-secondary rounded-tl-none'
          }`}
        >
          <p>{message.content}</p>
        </div>
        
        {/* 추가 상세 정보 (클릭 시 표시) */}
        {showDetails && (
          <div className="mt-1 text-xs text-muted-foreground">
            {formattedFullTime}
          </div>
        )}
      </div>
    </div>
  )
}