// 테스트 환경 설정
import { MockRedisClient } from '../lib/redis-mock';

// 테스트 실행 전에 Node.js 환경 변수 설정
process.env.NODE_ENV = 'test';

// 각 테스트 전에 Redis Mock 저장소 초기화
beforeEach(() => {
  MockRedisClient.clearStore();
});