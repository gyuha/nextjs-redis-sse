'use client';

import { useState, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface MessageInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}

export function MessageInput({ 
  onSendMessage, 
  disabled = false,
  value,
  onChange
}: MessageInputProps) {
  // 로컬 상태 또는 부모로부터 전달된 상태 사용
  const [localMessage, setLocalMessage] = useState('');
  
  // 실제 사용할 메시지 값과 변경 함수
  const message = value !== undefined ? value : localMessage;
  const setMessage = onChange || setLocalMessage;

  const handleSendMessage = () => {
    if (message.trim() && !disabled) {
      onSendMessage(message);
      setMessage('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex items-center space-x-2 p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
      <Input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="메시지 입력..."
        disabled={disabled}
        className="flex-1"
      />
      <Button 
        onClick={handleSendMessage} 
        disabled={!message.trim() || disabled}
      >
        전송
      </Button>
    </div>
  );
}