'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ChatChannel } from '@/lib/types';

interface SidebarProps {
  channels: ChatChannel[];
  currentChannel: string;
  username: string;
}

export function Sidebar({ channels, currentChannel, username }: SidebarProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const router = useRouter();

  const handleChannelClick = (channelId: string) => {
    // 모바일에서 사이드바를 닫음
    setIsMobileOpen(false);
    
    // 채널 이동 시 현재 사용자 이름 유지
    router.push(`/channel/${channelId}?username=${encodeURIComponent(username)}`);
  };

  return (
    <>
      {/* 모바일 토글 버튼 */}
      <div className="block lg:hidden fixed top-4 left-4 z-50">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsMobileOpen(!isMobileOpen)}
        >
          {isMobileOpen ? '닫기' : '채널'}
        </Button>
      </div>

      {/* 사이드바 */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 p-4 transform transition-transform duration-200 ease-in-out ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="py-4">
            <h3 className="text-lg font-semibold mb-4">채널 목록</h3>
            <nav className="space-y-2">
              {channels.map((channel) => (
                <div
                  key={channel.id}
                  className={`px-3 py-2 rounded-md cursor-pointer flex items-center ${
                    channel.id === currentChannel
                      ? 'bg-blue-100 dark:bg-blue-900'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                  onClick={() => handleChannelClick(channel.id)}
                >
                  <span># {channel.name}</span>
                </div>
              ))}
            </nav>
          </div>

          <div className="mt-auto border-t border-gray-200 dark:border-gray-800 pt-4">
            <div className="text-sm text-gray-500">
              로그인: <span className="font-semibold">{username}</span>
            </div>
            <Link href="/" className="text-sm text-blue-500 hover:underline mt-2 block">
              로그아웃
            </Link>
          </div>
        </div>
      </div>
      
      {/* 모바일 오버레이 */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        ></div>
      )}
    </>
  );
}