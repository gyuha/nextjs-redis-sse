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

export async function getRedisClient(): Promise<RedisClientType> {
  if (!redisClient) {
    redisClient = createRedisClient();
    await redisClient.connect();
  }
  
  return redisClient;
}

// Redis 클라이언트 리셋 (주로 테스트에서 사용)
export function resetRedisClient(): void {
  redisClient = null;
}