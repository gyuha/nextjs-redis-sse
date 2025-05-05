'use client';

import { useEffect, useRef } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { format } from 'date-fns';
import DOMPurify from 'dompurify';

export interface MessageProps {
  id: string;
  content: string;
  username: string;
  timestamp: string;
  isCurrentUser?: boolean;
}

export function MessageItem({ content, username, timestamp, isCurrentUser }: MessageProps) {
  const messageRef = useRef<HTMLDivElement>(null);
  
  // 새 메시지가 추가되면 자동 스크롤
  useEffect(() => {
    if (messageRef.current) {
      messageRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);
  
  // XSS 방지를 위해 메시지 내용 정화
  const sanitizedContent = DOMPurify.sanitize(content);
  
  // 사용자 이니셜 추출
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };
  
  // 메시지 시간 포맷
  const formattedTime = format(new Date(timestamp), 'HH:mm');

  return (
    <div
      ref={messageRef}
      className={`group flex items-start gap-3 py-2 ${
        isCurrentUser ? 'flex-row-reverse' : ''
      }`}
    >
      <Avatar className="h-8 w-8">
        <AvatarFallback className={isCurrentUser ? 'bg-primary text-primary-foreground' : 'bg-muted'}>
          {getInitials(username)}
        </AvatarFallback>
      </Avatar>
      
      <div className={`flex flex-col ${isCurrentUser ? 'items-end' : 'items-start'}`}>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${isCurrentUser ? 'order-2' : ''}`}>
            {username}
          </span>
          <span className="text-xs text-muted-foreground">
            {formattedTime}
          </span>
        </div>
        
        <div
          className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
            isCurrentUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          }`}
          dangerouslySetInnerHTML={{ __html: sanitizedContent }}
        />
      </div>
    </div>
  );
}