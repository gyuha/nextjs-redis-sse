import { create } from 'zustand';
import { ChatMessage } from './pubsub';

// 사용자 상태 인터페이스
interface UserState {
  username: string;
  isLoggedIn: boolean;
  setUsername: (username: string) => void;
  login: () => void;
  logout: () => void;
}

// 채널 상태 인터페이스
interface ChannelState {
  currentChannelId: string | null;
  channels: Array<{ id: string; name: string; userCount: number }>;
  setCurrentChannelId: (channelId: string) => void;
  setChannels: (channels: Array<{ id: string; name: string; userCount: number }>) => void;
}

// 메시지 상태 인터페이스
interface MessageState {
  messages: Record<string, ChatMessage[]>;
  addMessage: (channelId: string, message: ChatMessage) => void;
  setMessages: (channelId: string, messages: ChatMessage[]) => void;
  clearMessages: (channelId: string) => void;
}

// 사용자 목록 상태 인터페이스
interface UserListState {
  channelUsers: Record<string, string[]>;
  setChannelUsers: (channelId: string, users: string[]) => void;
}

// 연결 상태 인터페이스
interface ConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  setConnected: (isConnected: boolean) => void;
  setConnecting: (isConnecting: boolean) => void;
  setConnectionError: (error: string | null) => void;
}

// 통합 상태 인터페이스
interface ChatStore extends UserState, ChannelState, MessageState, UserListState, ConnectionState {}

// Zustand 스토어 생성
export const useChatStore = create<ChatStore>((set) => ({
  // 사용자 상태 초기값
  username: '',
  isLoggedIn: false,
  
  // 채널 상태 초기값
  currentChannelId: null,
  channels: [],
  
  // 메시지 상태 초기값
  messages: {},
  
  // 사용자 목록 상태 초기값
  channelUsers: {},
  
  // 연결 상태 초기값
  isConnected: false,
  isConnecting: false,
  connectionError: null,
  
  // 사용자 상태 관리 액션
  setUsername: (username) => set({ username }),
  login: () => set({ isLoggedIn: true }),
  logout: () => set({ isLoggedIn: false }),
  
  // 채널 상태 관리 액션
  setCurrentChannelId: (channelId) => set({ currentChannelId: channelId }),
  setChannels: (channels) => set({ channels }),
  
  // 메시지 상태 관리 액션
  addMessage: (channelId, message) => 
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: [...(state.messages[channelId] || []), message],
      },
    })),
  
  setMessages: (channelId, messages) => 
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: messages,
      },
    })),
  
  clearMessages: (channelId) => 
    set((state) => {
      const { [channelId]: _, ...rest } = state.messages;
      return { messages: rest };
    }),
  
  // 사용자 목록 상태 관리 액션
  setChannelUsers: (channelId, users) => 
    set((state) => ({
      channelUsers: {
        ...state.channelUsers,
        [channelId]: users,
      },
    })),
  
  // 연결 상태 관리 액션
  setConnected: (isConnected) => set({ isConnected }),
  setConnecting: (isConnecting) => set({ isConnecting }),
  setConnectionError: (connectionError) => set({ connectionError }),
}));