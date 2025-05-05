import { createClient } from 'redis';
import { MockRedisClient } from './redis-mock';

// Redis 클라이언트 타입 정의
export type RedisClientType = ReturnType<typeof createClient> | MockRedisClient;

// Redis 클라이언트 생성 함수
export function createRedisClient(): RedisClientType {
  // 테스트 환경인지 확인
  const isTest = process.env.NODE_ENV === 'test';
  
  // 테스트 환경이면 Mock Redis 클라이언트 반환
  if (isTest) {
    console.log('🧪 테스트 환경에서 Mock Redis 클라이언트 사용');
    return new MockRedisClient();
  }
  
  // 환경 변수에서 Redis 연결 정보 가져오기
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  
  // Redis 클라이언트 생성
  const client = createClient({
    url,
    password: process.env.REDIS_PASSWORD || undefined,
  });

  // 에러 핸들링
  client.on('error', (err) => {
    console.error('Redis 클라이언트 에러:', err);
  });

  return client;
}

// 싱글톤 패턴으로 Redis 클라이언트 관리
let redisClient: RedisClientType | null = null;
let isInitialized = false;

// Redis 데이터 초기화 함수
async function initializeRedisData(client: RedisClientType): Promise<void> {
  try {
    console.log('🔄 Redis 데이터 초기화 시작...');
    
    // FLUSHALL 명령어는 모든 DB의 모든 키를 삭제합니다
    // FLUSHDB는 현재 DB의 모든 키만 삭제합니다
    await client.flushDb();
    
    console.log('✅ Redis 데이터 초기화 완료');
    
    // 기본 채널 데이터 설정
    const defaultChannels = [
      { id: 'general', name: '일반', userCount: 0 },
      { id: 'random', name: '랜덤', userCount: 0 },
      { id: 'help', name: '도움말', userCount: 0 },
      { id: 'announcements', name: '공지사항', userCount: 0 },
      { id: 'dev', name: '개발자', userCount: 0 }
    ];
    
    // 채널 정보 저장
    for (const channel of defaultChannels) {
      await client.hSet(`channel:${channel.id}`, 'name', channel.name);
      await client.hSet(`channel:${channel.id}`, 'userCount', '0');
    }
    
    // 채널 목록에 채널 ID 추가
    await client.sAdd('channels', ...defaultChannels.map(c => c.id));
    
    console.log('✅ 기본 채널 데이터 설정 완료');
    
    // 초기화 상태 표시
    isInitialized = true;
  } catch (error) {
    console.error('❌ Redis 데이터 초기화 중 오류 발생:', error);
    throw error;
  }
}

export async function getRedisClient(): Promise<RedisClientType> {
  if (!redisClient) {
    console.log('📌 새 Redis 클라이언트 생성 중...');
    redisClient = createRedisClient();
    await redisClient.connect();
    
    // 서버 시작 시 한 번만 데이터 초기화
    if (!isInitialized && process.env.NODE_ENV !== 'test') {
      await initializeRedisData(redisClient);
    }
  }
  
  return redisClient;
}

// Redis 클라이언트 리셋 (주로 테스트에서 사용)
export function resetRedisClient(): void {
  if (redisClient) {
    // 연결 종료 시도
    try {
      (redisClient as any).disconnect?.();
    } catch (error) {
      console.error('Redis 클라이언트 종료 중 오류:', error);
    }
  }
  redisClient = null;
  isInitialized = false;
}

// 수동으로 Redis 데이터 초기화 수행 (필요한 경우 외부에서 호출)
export async function manuallyResetRedisData(): Promise<void> {
  const client = await getRedisClient();
  isInitialized = false; // 강제로 초기화 상태 리셋
  await initializeRedisData(client);
}