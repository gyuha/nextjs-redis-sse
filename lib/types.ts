// 채팅 메시지 타입
export interface ChatMessage {
  id: string;
  channel: string;
  sender: string;
  content: string;
  timestamp: number;
}

// 채팅 채널 타입
export interface ChatChannel {
  id: string;
  name: string;
}

export interface ChatUser {
  id: string;
  name: string;
}