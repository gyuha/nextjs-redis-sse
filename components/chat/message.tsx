'use client';

import { ChatMessage } from '@/lib/types';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { motion } from 'framer-motion';
import DOMPurify from 'dompurify';

interface ChatMessageProps {
  message: ChatMessage;
  isCurrentUser: boolean;
}

export function ChatMessageItem({ message, isCurrentUser }: ChatMessageProps) {
  // 메시지 시간 포맷팅 (YYYY-MM-DD HH:mm:ss)
  const formattedTime = format(new Date(message.timestamp), 'HH:mm', { locale: ko });
  
  // XSS 방지를 위한 메시지 내용 정화
  const sanitizedContent = DOMPurify.sanitize(message.content);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} mb-4`}
    >
      <div className={`max-w-[70%] ${isCurrentUser ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800'} rounded-lg px-4 py-2`}>
        {!isCurrentUser && (
          <div className="font-semibold text-sm mb-1">{message.sender}</div>
        )}
        <div className="break-words" dangerouslySetInnerHTML={{ __html: sanitizedContent }} />
        <div className={`text-xs mt-1 ${isCurrentUser ? 'text-blue-100' : 'text-gray-500'}`}>
          {formattedTime}
        </div>
      </div>
    </motion.div>
  );
}