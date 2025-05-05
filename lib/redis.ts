import { createClient } from 'redis';

// Redis 클라이언트 타입 정의
export type RedisClientType = ReturnType<typeof createClient>;

// Redis 클라이언트 생성 함수
export function createRedisClient() {
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