import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { ChatMessage } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 채팅 로그 관리 유틸리티
const CHAT_HISTORY_PREFIX = 'chat_history_';
const MAX_MESSAGES_PER_CHANNEL = 100; // 채널당 최대 저장 메시지 수

/**
 * 특정 채널의 채팅 메시지를 로컬 스토리지에 저장
 */
export function saveChannelMessages(channelId: string, messages: ChatMessage[]): void {
  try {
    // 메시지 수가 너무 많은 경우 최신 메시지만 저장
    const messagesToSave = messages.length > MAX_MESSAGES_PER_CHANNEL
      ? messages.slice(messages.length - MAX_MESSAGES_PER_CHANNEL)
      : messages;
    
    localStorage.setItem(
      `${CHAT_HISTORY_PREFIX}${channelId}`,
      JSON.stringify(messagesToSave)
    );
  } catch (error) {
    console.error('채팅 메시지 저장 중 오류 발생:', error);
  }
}

/**
 * 특정 채널의 채팅 메시지를 로컬 스토리지에서 로드
 */
export function loadChannelMessages(channelId: string): ChatMessage[] {
  try {
    const savedMessages = localStorage.getItem(`${CHAT_HISTORY_PREFIX}${channelId}`);
    return savedMessages ? JSON.parse(savedMessages) : [];
  } catch (error) {
    console.error('채팅 메시지 로드 중 오류 발생:', error);
    return [];
  }
}

/**
 * 특정 채널의 채팅 메시지에 새 메시지 추가하고 저장
 */
export function addMessageToChannel(channelId: string, message: ChatMessage): ChatMessage[] {
  try {
    const currentMessages = loadChannelMessages(channelId);
    const updatedMessages = [...currentMessages, message];
    saveChannelMessages(channelId, updatedMessages);
    return updatedMessages;
  } catch (error) {
    console.error('채팅 메시지 추가 중 오류 발생:', error);
    return [];
  }
}

/**
 * 날짜를 포맷팅하는 함수
 */
export function formatDate(date: Date, formatStr: string = 'yyyy-MM-dd HH:mm:ss'): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return formatStr
    .replace('yyyy', year.toString())
    .replace('MM', month)
    .replace('dd', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}
