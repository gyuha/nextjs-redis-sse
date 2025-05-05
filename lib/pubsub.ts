import { getRedisClient, RedisClientType } from './redis';

// 메시지 타입 정의
export interface ChatMessage {
  id: string;
  channelId: string;
  content: string;
  username: string;
  timestamp: number;
}

// 채널 메시지 발행
export async function publishMessage(channelId: string, message: ChatMessage): Promise<void> {
  const client = await getRedisClient();
  await client.publish(`channel:${channelId}`, JSON.stringify(message));
  
  // 메시지 히스토리 저장 (최근 50개 메시지만 유지)
  await client.lPush(`messages:${channelId}`, JSON.stringify(message));
  await client.lTrim(`messages:${channelId}`, 0, 49);
}

// 채널의 최근 메시지 가져오기
export async function getRecentMessages(channelId: string, limit: number = 20): Promise<ChatMessage[]> {
  const client = await getRedisClient();
  const messages = await client.lRange(`messages:${channelId}`, 0, limit - 1);
  
  return messages
    .map(msg => JSON.parse(msg) as ChatMessage)
    .sort((a, b) => a.timestamp - b.timestamp); // 시간순 정렬
}

// 활성 채널 목록 가져오기
export async function getActiveChannels(): Promise<string[]> {
  const defaultChannels = (process.env.DEFAULT_CHANNELS || '일반,음악,게임,기술,취미').split(',');
  const client = await getRedisClient();
  
  // 활성 채널 키 가져오기
  const keys = await client.keys('messages:*');
  const activeChannels = keys
    .map(key => key.replace('messages:', ''))
    .filter(Boolean);
  
  // 기본 채널과 병합하고 중복 제거
  return [...new Set([...defaultChannels, ...activeChannels])];
}

// 채널의 현재 활성 사용자 추가 및 목록 가져오기
export async function addUserToChannel(channelId: string, username: string): Promise<string[]> {
  const client = await getRedisClient();
  
  // 사용자를 채널에 추가 (Set 사용)
  await client.sAdd(`users:${channelId}`, username);
  
  // 사용자 활성 시간 업데이트
  await client.hSet(`user:activity`, username, Date.now().toString());
  
  // 채널의 모든 활성 사용자 반환
  return getChannelUsers(channelId);
}

// 채널에서 사용자 제거
export async function removeUserFromChannel(channelId: string, username: string): Promise<void> {
  const client = await getRedisClient();
  await client.sRem(`users:${channelId}`, username);
}

// 채널의 활성 사용자 목록 가져오기
export async function getChannelUsers(channelId: string): Promise<string[]> {
  const client = await getRedisClient();
  return client.sMembers(`users:${channelId}`);
}

// 비활성 사용자 정리 (5분 이상 활동이 없는 사용자)
export async function cleanInactiveUsers(): Promise<void> {
  const client = await getRedisClient();
  const now = Date.now();
  const inactiveThreshold = now - 5 * 60 * 1000; // 5분
  
  // 모든 사용자의 활동 시간 가져오기
  const userActivities = await client.hGetAll('user:activity');
  
  for (const [username, lastActivityStr] of Object.entries(userActivities)) {
    const lastActivity = parseInt(lastActivityStr, 10);
    
    // 비활성 사용자 확인
    if (lastActivity < inactiveThreshold) {
      // 모든 채널에서 해당 사용자 제거
      const channelKeys = await client.keys('users:*');
      for (const channelKey of channelKeys) {
        await client.sRem(channelKey, username);
      }
      
      // 활동 기록에서 제거
      await client.hDel('user:activity', username);
    }
  }
}