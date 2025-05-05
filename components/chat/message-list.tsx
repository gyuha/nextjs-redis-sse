'use client'

import { useEffect, useRef } from 'react'
import { ChatMessage } from '@/lib/pubsub'
import MessageItem from '@/components/chat/message-item'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

interface MessageListProps {
  messages: ChatMessage[]
  currentUser: string
  isLoading?: boolean
}

export default function MessageList({ 
  messages, 
  currentUser,
  isLoading = false
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  // 새 메시지가 도착할 때 스크롤 아래로 이동
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom()
    }
  }, [messages.length])

  // 스크롤을 맨 아래로 내림
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  
  // 메시지를 날짜별로 그룹화
  const groupMessagesByDate = (messages: ChatMessage[]) => {
    const groups: { [date: string]: ChatMessage[] } = {}
    
    messages.forEach(message => {
      const date = new Date(message.timestamp)
      const dateStr = format(date, 'yyyy년 MM월 dd일')
      
      if (!groups[dateStr]) {
        groups[dateStr] = []
      }
      
      groups[dateStr].push(message)
    })
    
    return groups
  }
  
  const messageGroups = groupMessagesByDate(messages)
  
  // 메시지가 없거나 로딩 중일 때 표시
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
        {isLoading ? (
          <div className="flex flex-col items-center">
            <Loader2 className="h-6 w-6 animate-spin mb-2" />
            <p>메시지를 불러오는 중...</p>
          </div>
        ) : (
          <p>아직 메시지가 없습니다. 첫 메시지를 보내보세요!</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4">
      {Object.entries(messageGroups).map(([date, msgs]) => (
        <div key={date} className="mb-4">
          {/* 날짜 구분선 */}
          <div className="flex items-center justify-center mb-4">
            <div className="bg-muted h-px flex-grow" />
            <span className="px-2 text-xs text-muted-foreground">{date}</span>
            <div className="bg-muted h-px flex-grow" />
          </div>
          
          {/* 해당 날짜의 메시지들 */}
          <div className="space-y-4">
            {msgs.map((message, index) => (
              <MessageItem 
                key={`${message.id || message.timestamp}-${index}`} 
                message={message} 
                isCurrentUser={message.username === currentUser} 
              />
            ))}
          </div>
        </div>
      ))}
      
      {/* 스크롤 기준점 */}
      <div ref={messagesEndRef} />
    </div>
  )
}