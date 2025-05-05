// Redis 모킹을 위한 간단한 구현
import { EventEmitter } from 'events';

// 간단한 인메모리 저장소
const memoryStore: Record<string, any> = {
  lists: {},   // lPush, lRange 등을 위한 리스트 저장소
  keys: {},    // 키 저장소
  sets: {},    // Set 작업을 위한 저장소
  values: {},  // 일반 값 저장소
  hashes: {},  // 해시 저장소
};

// 발행-구독 이벤트 관리를 위한 이벤트 이미터
const pubSubEmitter = new EventEmitter();
// 최대 리스너 수 증가 (기본값 10)
pubSubEmitter.setMaxListeners(100);

// 모킹된 Redis 클라이언트
export class MockRedisClient {
  connected: boolean = false;
  
  // 연결
  async connect(): Promise<void> {
    this.connected = true;
    return Promise.resolve();
  }
  
  // 연결 종료
  async quit(): Promise<void> {
    this.connected = false;
    return Promise.resolve();
  }
  
  // 클라이언트 복제
  duplicate(): MockRedisClient {
    return new MockRedisClient();
  }
  
  // 에러 이벤트 리스너 등록
  on(event: string, listener: (...args: any[]) => void): this {
    return this;
  }

  // 값 발행
  async publish(channel: string, message: string): Promise<number> {
    pubSubEmitter.emit(channel, message);
    return Promise.resolve(1); // 1개 클라이언트에 발행됨을 모의
  }
  
  // 채널 구독
  async subscribe(channel: string, callback: (message: string, channel: string) => void): Promise<void> {
    pubSubEmitter.on(channel, (message) => callback(message, channel));
    return Promise.resolve();
  }
  
  // 구독 취소
  async unsubscribe(channel: string): Promise<void> {
    pubSubEmitter.removeAllListeners(channel);
    return Promise.resolve();
  }
  
  // 리스트에 항목 추가
  async lPush(key: string, value: string): Promise<number> {
    if (!memoryStore.lists[key]) {
      memoryStore.lists[key] = [];
    }
    memoryStore.lists[key].unshift(value);
    return Promise.resolve(memoryStore.lists[key].length);
  }
  
  // 리스트 크기 조정
  async lTrim(key: string, start: number, stop: number): Promise<string> {
    if (memoryStore.lists[key]) {
      memoryStore.lists[key] = memoryStore.lists[key].slice(start, stop + 1);
    }
    return Promise.resolve('OK');
  }
  
  // 리스트 범위 조회
  async lRange(key: string, start: number, stop: number): Promise<string[]> {
    if (!memoryStore.lists[key]) {
      return Promise.resolve([]);
    }
    return Promise.resolve(memoryStore.lists[key].slice(start, stop + 1));
  }
  
  // 키 패턴 조회
  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const allKeys = Object.keys(memoryStore.keys)
      .concat(Object.keys(memoryStore.lists))
      .concat(Object.keys(memoryStore.sets))
      .concat(Object.keys(memoryStore.values))
      .concat(Object.keys(memoryStore.hashes));
    
    return Promise.resolve([...new Set(allKeys.filter(key => regex.test(key)))]);
  }
  
  // Set에 항목 추가
  async sAdd(key: string, member: string): Promise<number> {
    if (!memoryStore.sets[key]) {
      memoryStore.sets[key] = new Set();
    }
    const had = memoryStore.sets[key].has(member);
    memoryStore.sets[key].add(member);
    return Promise.resolve(had ? 0 : 1);
  }
  
  // Set에서 항목 제거
  async sRem(key: string, member: string): Promise<number> {
    if (!memoryStore.sets[key]) {
      return Promise.resolve(0);
    }
    const had = memoryStore.sets[key].has(member);
    memoryStore.sets[key].delete(member);
    return Promise.resolve(had ? 1 : 0);
  }
  
  // Set의 모든 멤버 조회
  async sMembers(key: string): Promise<string[]> {
    if (!memoryStore.sets[key]) {
      return Promise.resolve([]);
    }
    return Promise.resolve([...memoryStore.sets[key]]);
  }
  
  // 해시에서 모든 필드와 값 조회
  async hGetAll(key: string): Promise<Record<string, string>> {
    return Promise.resolve(memoryStore.hashes[key] || {});
  }
  
  // 해시에 필드와 값 설정
  async hSet(key: string, field: string, value: string): Promise<number> {
    if (!memoryStore.hashes[key]) {
      memoryStore.hashes[key] = {};
    }
    const isNew = memoryStore.hashes[key][field] === undefined;
    memoryStore.hashes[key][field] = value;
    return Promise.resolve(isNew ? 1 : 0);
  }
  
  // 해시에서 필드 제거
  async hDel(key: string, field: string): Promise<number> {
    if (!memoryStore.hashes[key] || memoryStore.hashes[key][field] === undefined) {
      return Promise.resolve(0);
    }
    delete memoryStore.hashes[key][field];
    return Promise.resolve(1);
  }
  
  // 스토어 초기화 (테스트용)
  static clearStore(): void {
    memoryStore.lists = {};
    memoryStore.keys = {};
    memoryStore.sets = {};
    memoryStore.values = {};
    memoryStore.hashes = {};
    pubSubEmitter.removeAllListeners();
  }
}