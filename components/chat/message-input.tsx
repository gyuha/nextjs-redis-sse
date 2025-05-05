'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send } from 'lucide-react'

interface MessageInputProps {
  onSendMessage: (content: string) => void
  isDisabled?: boolean
}

export default function MessageInput({ 
  onSendMessage, 
  isDisabled = false 
}: MessageInputProps) {
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  // 컴포넌트 마운트 시 텍스트 영역에 포커스
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])
  
  // 메시지 전송 처리
  const handleSendMessage = async () => {
    if (!message.trim() || isDisabled || isSubmitting) return
    
    try {
      setIsSubmitting(true)
      await onSendMessage(message)
      setMessage('')
      
      // 전송 후 textarea에 포커스
      textareaRef.current?.focus()
    } finally {
      setIsSubmitting(false)
    }
  }
  
  // Enter 키로 메시지 전송 처리 (Shift+Enter는 줄바꿈)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div className="flex gap-2 items-end">
      <Textarea
        ref={textareaRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isDisabled ? "연결 중..." : "메시지 입력..."}
        className="resize-none min-h-[60px] max-h-[200px]"
        disabled={isDisabled}
      />
      <Button 
        onClick={handleSendMessage} 
        disabled={!message.trim() || isDisabled || isSubmitting}
        className="h-[60px] w-[60px]"
      >
        <Send className="h-5 w-5" />
      </Button>
    </div>
  )
}