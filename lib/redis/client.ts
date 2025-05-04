import Redis from 'ioredis';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB) || 0,
    });
  }
  
  return redisClient;
}

export async function publishMessage(channel: string, message: string): Promise<number> {
  const client = getRedisClient();
  return await client.publish(channel, message);
}

export async function subscribeToChannel(channel: string, callback: (message: string) => void): Promise<Redis> {
  // 구독용 클라이언트는 별도로 생성 (Redis pub/sub 특성상 구독 중에는 다른 명령을 처리할 수 없음)
  const subscriber = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB) || 0,
  });
  
  await subscriber.subscribe(channel);
  
  subscriber.on('message', (subscribedChannel, message) => {
    if (channel === subscribedChannel) {
      callback(message);
    }
  });
  
  return subscriber;
}

export function closeRedisConnection(): void {
  if (redisClient) {
    redisClient.disconnect();
    redisClient = null;
  }
}