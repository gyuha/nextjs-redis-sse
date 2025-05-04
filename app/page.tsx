'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Form } from '@/components/ui/form';
import { motion } from 'framer-motion';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

// 채팅 참가 폼을 위한 Zod 스키마
const formSchema = z.object({
  username: z.string().min(2, {
    message: '사용자 이름은 최소 2자 이상이어야 합니다.',
  }).max(50),
  channel: z.string().min(1, {
    message: '채널을 선택해주세요.',
  }),
});

// 기본 채널 목록
const defaultChannels = [
  { id: 'general', name: '일반' },
  { id: 'random', name: '랜덤' },
  { id: 'help', name: '도움말' },
  { id: 'announcements', name: '공지사항' },
];

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  
  // React Hook Form 설정
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: '',
      channel: '',
    },
  });

  // 폼 제출 핸들러
  function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    
    // 채널 페이지로 이동 (query parameter로 사용자 이름과 채널 전달)
    router.push(`/channel/${values.channel}?username=${encodeURIComponent(values.username)}`);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between text-sm flex flex-col">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md mx-auto"
        >
          <Card className="p-6">
            <div className="flex flex-col space-y-6">
              <div className="text-center">
                <h1 className="text-2xl font-bold">실시간 채팅</h1>
                <p className="text-muted-foreground mt-2">
                  채널을 선택하고 대화에 참여하세요
                </p>
              </div>
              
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="username" className="text-sm font-medium">
                    사용자 이름
                  </label>
                  <Input
                    id="username"
                    placeholder="이름을 입력하세요"
                    {...form.register('username')}
                    disabled={isLoading}
                  />
                  {form.formState.errors.username && (
                    <p className="text-red-500 text-sm">
                      {form.formState.errors.username.message}
                    </p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="channel" className="text-sm font-medium">
                    채널 선택
                  </label>
                  <select
                    id="channel"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    {...form.register('channel')}
                    disabled={isLoading}
                  >
                    <option value="">채널을 선택하세요</option>
                    {defaultChannels.map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        {channel.name}
                      </option>
                    ))}
                  </select>
                  {form.formState.errors.channel && (
                    <p className="text-red-500 text-sm">
                      {form.formState.errors.channel.message}
                    </p>
                  )}
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={isLoading}
                >
                  {isLoading ? '입장 중...' : '채팅 입장하기'}
                </Button>
              </form>
            </div>
          </Card>
        </motion.div>
      </div>
    </main>
  );
}
