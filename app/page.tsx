'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useChatStore } from '@/lib/store'
import { fetchChannels } from '@/lib/chat'
import UserEntryForm from '@/components/forms/user-entry-form'

export default function HomePage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const { 
    setUsername, 
    login, 
    setChannels, 
    setCurrentChannelId, 
    channels 
  } = useChatStore()

  // 채널 목록 가져오기
  useEffect(() => {
    const loadChannels = async () => {
      try {
        setIsLoading(true)
        const channels = await fetchChannels()
        setChannels(channels)
        setError(null)
      } catch (err) {
        setError('채널 목록을 불러오는 데 실패했습니다.')
        console.error('채널 로딩 오류:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadChannels()
  }, [setChannels])

  // 사용자 입장 처리
  const handleUserEntry = async (username: string, channelId: string) => {
    try {
      setUsername(username)
      setCurrentChannelId(channelId)
      login() // 로그인 상태로 변경
      
      // 채널 페이지로 이동
      router.push(`/channel/${encodeURIComponent(channelId)}`)
    } catch (err) {
      console.error('사용자 입장 오류:', err)
      setError('채팅방 입장에 실패했습니다.')
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-24 bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-800 dark:text-gray-100">
          실시간 채팅
        </h1>
        
        {error && (
          <div className="p-3 mb-4 text-sm rounded-md bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
            <p>{error}</p>
          </div>
        )}

        <UserEntryForm 
          onSubmit={handleUserEntry}
          channels={channels}
          isLoading={isLoading}
        />

        <p className="text-sm text-center mt-8 text-gray-500 dark:text-gray-400">
          Redis와 SSE를 사용한 실시간 채팅 애플리케이션
        </p>
      </div>
    </main>
  )
}
