import { NextRequest, NextResponse } from 'next/server';
import { getActiveChannels, getChannelUsers, addUserToChannel, removeUserFromChannel } from '@/lib/pubsub';
import { getRedisClient } from '@/lib/redis';

// 채널 목록 조회
export async function GET(request: NextRequest) {
  try {
    // 활성 채널 목록 가져오기
    const channels = await getActiveChannels();
    
    // 각 채널별 사용자 수 계산
    const channelData = await Promise.all(
      channels.map(async (channel) => {
        const users = await getChannelUsers(channel);
        return {
          id: channel,
          name: channel,
          userCount: users.length
        };
      })
    );
    
    return NextResponse.json({ channels: channelData });
  } catch (error: any) {
    console.error('채널 조회 에러:', error);
    return NextResponse.json(
      { error: '채널 정보를 조회할 수 없습니다.', details: error.message },
      { status: 500 }
    );
  }
}

// 모든 채널 정보를 업데이트하고 발행하는 함수
async function updateAndPublishChannelsInfo(redis: any) {
  try {
    // 활성 채널 목록 가져오기
    const channels = await getActiveChannels();
    
    // 각 채널별 사용자 수 계산
    const channelData = await Promise.all(
      channels.map(async (channel) => {
        const users = await getChannelUsers(channel);
        return {
          id: channel,
          name: channel,
          userCount: users.length
        };
      })
    );
    
    // 전체 채널 목록 정보 발행 - 모든 클라이언트가 구독할 수 있는 공통 채널
    await redis.publish('channels:update', JSON.stringify(channelData));
    
    return channelData;
  } catch (error) {
    console.error('채널 정보 업데이트 중 오류:', error);
    throw error;
  }
}

// 사용자 채널 입장/퇴장
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channelId, username, action } = body;
    
    // 필수 필드 검증
    if (!channelId || !username || !action) {
      return NextResponse.json(
        { error: '채널 ID, 사용자 이름 및 액션은 필수입니다.' },
        { status: 400 }
      );
    }
    
    const redis = await getRedisClient();
    
    if (action === 'join') {
      // 채널에 사용자 추가
      const users = await addUserToChannel(channelId, username);
      
      // 사용자 입장 알림
      const notification = {
        id: `join-${Date.now()}`,
        type: 'system',
        username: '시스템',
        content: `${username}님이 입장했습니다.`,
        timestamp: new Date().toISOString()
      };
      
      // 사용자 목록 업데이트 발행
      await redis.publish(`users:update:${channelId}`, JSON.stringify(users));
      
      // 시스템 메시지 발행
      await redis.publish(`channel:${channelId}`, JSON.stringify(notification));
      
      // 모든 채널 정보 업데이트 및 발행
      await updateAndPublishChannelsInfo(redis);
      
      return NextResponse.json({ success: true, users });
    } else if (action === 'leave') {
      // 채널에서 사용자 제거
      await removeUserFromChannel(channelId, username);
      
      // 남은 사용자 목록 가져오기
      const users = await getChannelUsers(channelId);
      
      // 사용자 퇴장 알림
      const notification = {
        id: `leave-${Date.now()}`,
        type: 'system',
        username: '시스템',
        content: `${username}님이 퇴장했습니다.`,
        timestamp: new Date().toISOString()
      };
      
      // 사용자 목록 업데이트 발행
      await redis.publish(`users:update:${channelId}`, JSON.stringify(users));
      
      // 시스템 메시지 발행
      await redis.publish(`channel:${channelId}`, JSON.stringify(notification));
      
      // 모든 채널 정보 업데이트 및 발행
      await updateAndPublishChannelsInfo(redis);
      
      return NextResponse.json({ success: true, users });
    } else {
      return NextResponse.json(
        { error: '유효한 액션이 아닙니다. "join" 또는 "leave"를 사용하세요.' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('채널 작업 에러:', error);
    return NextResponse.json(
      { error: '채널 작업을 처리할 수 없습니다.', details: error.message },
      { status: 500 }
    );
  }
}