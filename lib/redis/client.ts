import Redis from 'ioredis';

let redisClient: Redis | null = null;
let retryAttempts = 0;
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAY_MS = 2000;

export function getRedisClient(): Redis {
  if (!redisClient) {
    try {
      redisClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: Number(process.env.REDIS_DB) || 0,
        retryStrategy: (times) => {
          if (times > MAX_RETRY_ATTEMPTS) {
            console.error('Redis 연결 재시도 횟수 초과');
            return null; // 재시도 중단
          }
          return Math.min(times * RETRY_DELAY_MS, 10000); // 점진적 재시도 간격
        },
      });

      redisClient.on('error', (err) => {
        console.error('Redis 연결 오류:', err);
      });

      redisClient.on('connect', () => {
        console.log('Redis 서버에 연결됨');
        retryAttempts = 0; // 연결 성공 시 재시도 카운터 초기화
      });
    } catch (err) {
      console.error('Redis 클라이언트 생성 중 오류:', err);
      throw err;
    }
  }
  
  return redisClient;
}

export async function publishMessage(channel: string, message: string): Promise<number> {
  try {
    const client = getRedisClient();
    return await client.publish(channel, message);
  } catch (error) {
    console.error(`채널 '${channel}'에 메시지 발행 중 오류:`, error);
    throw error;
  }
}

export async function subscribeToChannel(channel: string, callback: (message: string) => void): Promise<Redis> {
  try {
    // 구독용 클라이언트는 별도로 생성 (Redis pub/sub 특성상 구독 중에는 다른 명령을 처리할 수 없음)
    const subscriber = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB) || 0,
      retryStrategy: (times) => {
        if (times > MAX_RETRY_ATTEMPTS) {
          console.error('Redis 구독 연결 재시도 횟수 초과');
          return null; // 재시도 중단
        }
        return Math.min(times * RETRY_DELAY_MS, 10000);
      },
    });
    
    subscriber.on('error', (err) => {
      console.error(`채널 '${channel}' 구독 중 Redis 오류:`, err);
    });

    subscriber.on('connect', () => {
      console.log(`채널 '${channel}'에 구독 연결 성공`);
    });

    await subscriber.subscribe(channel);
    
    subscriber.on('message', (subscribedChannel, message) => {
      if (channel === subscribedChannel) {
        try {
          callback(message);
        } catch (error) {
          console.error('메시지 처리 중 오류:', error);
        }
      }
    });
    
    return subscriber;
  } catch (error) {
    console.error(`채널 '${channel}' 구독 중 오류:`, error);
    throw error;
  }
}

export function closeRedisConnection(): void {
  if (redisClient) {
    try {
      redisClient.disconnect();
      redisClient = null;
    } catch (error) {
      console.error('Redis 연결 종료 중 오류:', error);
    }
  }
}