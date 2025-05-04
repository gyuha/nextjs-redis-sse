import Redis from 'ioredis';

// Redis 클라이언트 인스턴스
let redisClient: Redis | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 20;

// Redis 연결 설정
export const getRedisClient = (): Redis => {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD,
      // 연결 안정성을 위한 옵션 추가
      connectTimeout: 10000, // 연결 타임아웃 10초
      maxRetriesPerRequest: 5, // 요청당 최대 재시도 횟수
      enableReadyCheck: true, // 준비 상태 확인 활성화
      enableOfflineQueue: true, // 오프라인 큐 활성화
      retryStrategy: (times) => {
        if (times > MAX_RECONNECT_ATTEMPTS) {
          // 최대 재시도 횟수 초과 시
          console.error(`Redis 재연결 최대 시도 횟수(${MAX_RECONNECT_ATTEMPTS}) 초과`);
          return null; // 재연결 중단
        }
        // 지수 백오프 적용 (시도 횟수에 따라 대기 시간 증가)
        const delay = Math.min(Math.pow(2, times) * 50, 5000);
        console.log(`Redis 연결 재시도 ${times}/${MAX_RECONNECT_ATTEMPTS}, ${delay}ms 후 재시도`);
        return delay;
      },
      reconnectOnError: (err) => {
        const targetErrors = ['READONLY', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET'];
        // 특정 오류 발생 시에만 재연결 시도
        const shouldReconnect = targetErrors.some(e => err.message.includes(e));
        if (shouldReconnect) {
          console.log('재연결 가능한 Redis 오류 발생:', err.message);
        }
        return shouldReconnect;
      },
    });

    // 오류 이벤트 핸들러
    redisClient.on('error', (err) => {
      console.error('Redis 연결 오류:', err.message);
      reconnectAttempts++;
    });

    // 연결 이벤트 핸들러
    redisClient.on('connect', () => {
      console.log('Redis 서버에 연결됨');
      // 연결 성공 시 재시도 카운터 초기화
      reconnectAttempts = 0;
    });

    // 재연결 이벤트 핸들러
    redisClient.on('reconnecting', () => {
      console.log(`Redis 서버에 재연결 중 (시도: ${reconnectAttempts + 1})`);
    });

    // 연결 종료 이벤트 핸들러
    redisClient.on('close', () => {
      console.log('Redis 연결 종료됨');
    });

    // 연결 준비 완료 이벤트 핸들러
    redisClient.on('ready', () => {
      console.log('Redis 서버 준비 완료');
    });
  }

  return redisClient;
};

// 특정 채널에 메시지 발행
export const publishMessage = async (channel: string, message: any): Promise<number> => {
  // 최대 재시도 횟수
  const MAX_RETRY = 3;
  let retries = 0;

  while (retries < MAX_RETRY) {
    try {
      const client = getRedisClient();
      const stringMessage = typeof message === 'string' ? message : JSON.stringify(message);
      const result = await client.publish(channel, stringMessage);
      return result;
    } catch (error) {
      retries++;
      console.error(`메시지 발행 중 오류 (채널: ${channel}, 재시도: ${retries}/${MAX_RETRY}):`, error);
      
      // 마지막 시도가 아니면 잠시 대기 후 재시도
      if (retries < MAX_RETRY) {
        await new Promise(resolve => setTimeout(resolve, 500 * retries));
      } else {
        throw error; // 모든 재시도 실패 시 오류 발생
      }
    }
  }

  throw new Error(`메시지 발행 실패 (채널: ${channel}, 최대 재시도 횟수 초과)`);
};

// 채널 구독 및 메시지 수신 처리
export const subscribeToChannel = async (
  channel: string,
  callback: (message: string) => void
): Promise<Redis> => {
  // 구독 전용 Redis 클라이언트 생성
  const subscriber = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD,
    connectTimeout: 10000, // 연결 타임아웃 10초
    maxRetriesPerRequest: 5, // 요청당 최대 재시도 횟수
    enableReadyCheck: true, // 준비 상태 확인 활성화
    enableOfflineQueue: true, // 오프라인 큐 활성화
    autoResubscribe: true, // 자동 재구독 활성화
    retryStrategy: (times) => {
      if (times > 10) {
        return null; // 최대 10회 재시도 후 중단
      }
      // 지수 백오프 적용
      const delay = Math.min(Math.pow(2, times) * 50, 5000);
      console.log(`구독 Redis 연결 재시도 ${times}/10, ${delay}ms 후 재시도`);
      return delay;
    },
  });

  // 오류 처리 리스너
  subscriber.on('error', (error) => {
    console.error(`Redis 구독 오류 (채널: ${channel}):`, error.message);
  });

  // 연결 종료 리스너
  subscriber.on('end', () => {
    console.log(`Redis 구독 연결 종료 (채널: ${channel})`);
  });

  // 재연결 리스너
  subscriber.on('reconnecting', () => {
    console.log(`Redis 구독 재연결 중 (채널: ${channel})`);
  });

  // 연결 완료 리스너
  subscriber.on('connect', () => {
    console.log(`Redis 구독 연결 성공 (채널: ${channel})`);
  });

  // 구독 성공/실패 모니터링
  let subscribed = false;
  let subscribeError = null;

  // 구독 시도
  try {
    await subscriber.subscribe(channel);
    subscribed = true;
    console.log(`채널 구독 성공: ${channel}`);
  } catch (error) {
    subscribeError = error;
    console.error(`채널 구독 실패 (채널: ${channel}):`, error);
  }

  // 메시지 핸들러 (성공적으로 구독한 경우에만 등록)
  if (subscribed) {
    subscriber.on('message', (recvChannel: string, message: string) => {
      if (recvChannel === channel) {
        try {
          // 콜백 함수 호출
          callback(message);
        } catch (error) {
          console.error(`메시지 처리 중 오류 (채널: ${channel}):`, error);
        }
      }
    });

    // 구독 해제 시 이벤트 핸들러
    subscriber.on('unsubscribe', (unsubChannel: string, count: number) => {
      if (unsubChannel === channel) {
        console.log(`채널 구독 해제 (채널: ${channel}, 남은 구독: ${count})`);
      }
    });

    // 3분마다 핑 테스트로 연결 유효성 확인
    const pingInterval = setInterval(async () => {
      try {
        const pong = await subscriber.ping();
        if (pong !== 'PONG') {
          console.warn(`Redis 구독 핑 테스트 실패 (응답: ${pong})`);
        }
      } catch (error) {
        console.error(`Redis 구독 핑 테스트 중 오류:`, error);
        // 핑 실패 시 연결을 강제 종료하여 재연결 트리거
        try {
          clearInterval(pingInterval);
          subscriber.disconnect();
        } catch (e) {
          // 무시
        }
      }
    }, 180000); // 3분

    // 연결 종료 시 인터벌 정리
    subscriber.on('end', () => {
      clearInterval(pingInterval);
    });

    return subscriber;
  } else {
    // 구독 실패 시 연결 종료 및 오류 발생
    try {
      subscriber.disconnect();
    } catch (e) {
      // 이미 끊어진 연결을 닫으려고 하면 오류가 발생할 수 있으므로 무시
    }
    throw subscribeError || new Error(`알 수 없는 구독 오류 (채널: ${channel})`);
  }
};

// 채팅 메시지 저장 (채널별)
export const saveChannelMessage = async (
  channel: string,
  message: {
    content: string;
    sender: string;
    timestamp: number;
    type?: string;
  }
) => {
  try {
    const client = getRedisClient();
    const messageWithTimestamp = {
      ...message,
      timestamp: message.timestamp || Date.now(),
    };

    // Redis 리스트에 메시지 추가
    await client.lpush(`messages:${channel}`, JSON.stringify(messageWithTimestamp));

    // 최대 100개 메시지만 유지 (오래된 메시지 제거)
    await client.ltrim(`messages:${channel}`, 0, 99);

    // 채널에 메시지 발행
    await publishMessage(`chat:${channel}`, messageWithTimestamp);

    return messageWithTimestamp;
  } catch (error) {
    console.error(`메시지 저장 중 오류 (채널: ${channel}):`, error);
    throw error;
  }
};

// 채널의 메시지 기록 조회
export const getChannelMessages = async (channel: string, limit = 50) => {
  // 최대 재시도 횟수
  const MAX_RETRY = 3;
  let retries = 0;
  
  while (retries < MAX_RETRY) {
    try {
      const client = getRedisClient();
      const messages = await client.lrange(`messages:${channel}`, 0, limit - 1);
      
      return messages.map((msg) => JSON.parse(msg)).reverse();
    } catch (error) {
      retries++;
      console.error(`메시지 기록 조회 중 오류 (채널: ${channel}, 재시도: ${retries}/${MAX_RETRY}):`, error);
      
      // 마지막 시도가 아니면 잠시 대기 후 재시도
      if (retries < MAX_RETRY) {
        await new Promise(resolve => setTimeout(resolve, 500 * retries));
      } else {
        throw error; // 모든 재시도 실패 시 오류 발생
      }
    }
  }
  
  throw new Error(`메시지 기록 조회 실패 (채널: ${channel}, 최대 재시도 횟수 초과)`);
};

// Redis 연결 종료
export const closeRedisConnection = async () => {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('Redis 연결 정상 종료됨');
    } catch (error) {
      console.error('Redis 연결 종료 중 오류:', error);
      // 강제 연결 종료 시도
      try {
        redisClient.disconnect();
      } catch (e) {
        // 무시
      }
    } finally {
      redisClient = null;
    }
  }
};