'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Home, LogOut } from 'lucide-react'
import { useChatStore } from '@/lib/store'
import { useRouter } from 'next/navigation'
import { fetchChannels } from '@/lib/chat'

interface ChannelSidebarProps {
  currentChannelId: string
  onChannelChange: (channelId: string) => void
}

export default function ChannelSidebar({ 
  currentChannelId,
  onChannelChange 
}: ChannelSidebarProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const { 
    channels, 
    setChannels, 
    logout, 
    channelUsers, 
    updateChannelUserCount 
  } = useChatStore()
  
  // 채널 목록 불러오기
  useEffect(() => {
    const loadChannels = async () => {
      try {
        setIsLoading(true)
        const channelList = await fetchChannels()
        setChannels(channelList)
      } catch (error) {
        console.error('채널 목록 로딩 에러:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    loadChannels()
    
    // 주기적으로 채널 목록 갱신 (30초마다)
    const intervalId = setInterval(loadChannels, 30000)
    
    return () => clearInterval(intervalId)
  }, [setChannels])
  
  // 사용자 목록 변경 시 채널별 접속자 수 갱신
  useEffect(() => {
    // 모든 채널들에 대해 사용자 목록이 변경되면 접속자 수 업데이트
    Object.entries(channelUsers).forEach(([channelId, users]) => {
      // 사용자 수 업데이트 (현재 접속 중인 사용자 수)
      updateChannelUserCount(channelId, users.length)
    })
  }, [channelUsers, updateChannelUserCount])
  
  // 로그아웃 처리
  const handleLogout = () => {
    logout()
    router.push('/')
  }
  
  // 홈으로 돌아가기
  const handleBackToHome = () => {
    router.push('/')
  }

  return (
    <div className="w-64 border-r bg-card flex flex-col h-full">
      <div className="p-4 border-b">
        <h2 className="font-bold text-lg">채팅 채널</h2>
      </div>
      
      <div className="flex-1 overflow-auto p-2">
        <div className="space-y-1">
          {isLoading ? (
            <p className="text-sm text-muted-foreground p-2">채널 목록 로딩 중...</p>
          ) : channels.length === 0 ? (
            <p className="text-sm text-muted-foreground p-2">사용 가능한 채널이 없습니다.</p>
          ) : (
            channels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => onChannelChange(channel.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm ${
                  channel.id === currentChannelId
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'hover:bg-accent/50'
                }`}
              >
                <span># {channel.name}</span>
                <span className="text-xs bg-muted/50 px-1.5 py-0.5 rounded-full">
                  {channel.userCount}명
                </span>
              </button>
            ))
          )}
        </div>
      </div>
      
      <div className="p-2 border-t mt-auto">
        <div className="space-y-2">
          <Button 
            variant="ghost" 
            className="w-full justify-start" 
            size="sm"
            onClick={handleBackToHome}
          >
            <Home className="mr-2 h-4 w-4" />
            <span>홈으로</span>
          </Button>
          
          <Button 
            variant="ghost" 
            className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" 
            size="sm"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>로그아웃</span>
          </Button>
        </div>
      </div>
    </div>
  )
}