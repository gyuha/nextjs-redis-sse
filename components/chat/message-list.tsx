'use client';

import { useEffect, useRef } from 'react';
import { MessageItem, MessageProps } from './message-item';

interface MessageListProps {
  messages: MessageProps[];
  currentUsername: string;
}

export function MessageList({ messages, currentUsername }: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // 새 메시지가 추가되면 스크롤 아래로 이동
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // 메시지가 없는 경우 표시할 내용
  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-center">
        <p className="mb-2 text-lg font-medium">아직 메시지가 없습니다</p>
        <p className="text-sm text-muted-foreground">첫 메시지를 보내보세요!</p>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="flex-1 overflow-y-auto p-4 space-y-2"
    >
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          {...message}
          isCurrentUser={message.username === currentUsername}
        />
      ))}
    </div>
  );
}