'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Hash, Users } from 'lucide-react';

// 기본 채널 목록 설정
const DEFAULT_CHANNELS = [
  { id: 'general', name: '일반' },
  { id: 'random', name: '랜덤' },
  { id: 'help', name: '도움말' },
  { id: 'announcements', name: '공지사항' },
  { id: 'dev', name: '개발자' },
];

interface ChannelSidebarProps {
  username: string;
  activeUsers?: string[];
}

export function ChannelSidebar({ username, activeUsers = [] }: ChannelSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  
  // 현재 활성화된 채널 ID 확인
  const currentChannelId = pathname.split('/').pop();
  
  return (
    <div className={`flex flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}>
      {/* 사이드바 헤더 */}
      <div className="flex items-center justify-between p-4 h-16">
        {!collapsed && <h2 className="text-xl font-bold">Redis Chat</h2>}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto"
        >
          {collapsed ? '→' : '←'}
        </Button>
      </div>
      
      <Separator />
      
      {/* 사용자 정보 */}
      <div className="p-4">
        {collapsed ? (
          <div className="flex justify-center">
            <div className="bg-sidebar-primary text-sidebar-primary-foreground rounded-full w-8 h-8 flex items-center justify-center">
              {username[0].toUpperCase()}
            </div>
          </div>
        ) : (
          <div>
            <p className="font-medium">사용자:</p>
            <p className="text-sm">{username}</p>
          </div>
        )}
      </div>
      
      <Separator />
      
      {/* 채널 목록 */}
      <div className="flex-1 overflow-auto p-2">
        <div className={`mb-2 px-2 ${collapsed ? 'text-center' : ''}`}>
          {!collapsed && <h3 className="text-sm font-medium">채널 목록</h3>}
          {collapsed && <Hash className="mx-auto h-5 w-5" />}
        </div>
        
        <div className="space-y-1">
          {DEFAULT_CHANNELS.map((channel) => (
            <Link key={channel.id} href={`/channel/${channel.id}`}>
              <Button
                variant={currentChannelId === channel.id ? "secondary" : "ghost"}
                className={`w-full justify-start ${collapsed ? 'justify-center' : ''}`}
              >
                <Hash className="h-4 w-4 mr-2" />
                {!collapsed && channel.name}
              </Button>
            </Link>
          ))}
        </div>
      </div>
      
      {/* 활성 사용자 목록 */}
      {activeUsers.length > 0 && (
        <>
          <Separator />
          <div className="p-2">
            <div className={`mb-2 px-2 ${collapsed ? 'text-center' : ''}`}>
              {!collapsed && <h3 className="text-sm font-medium">활성 사용자 ({activeUsers.length})</h3>}
              {collapsed && <Users className="mx-auto h-5 w-5" />}
            </div>
            
            {!collapsed && (
              <div className="space-y-1">
                {activeUsers.map((user) => (
                  <div key={user} className="text-sm px-2 py-1">
                    {user}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}