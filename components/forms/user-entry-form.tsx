'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

// UI 컴포넌트
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

// 기본 채널 목록 설정
const DEFAULT_CHANNELS = [
  { id: 'general', name: '일반' },
  { id: 'random', name: '랜덤' },
  { id: 'help', name: '도움말' },
  { id: 'announcements', name: '공지사항' },
  { id: 'dev', name: '개발자' },
];

// 폼 유효성 검증 스키마
const formSchema = z.object({
  username: z
    .string()
    .min(2, { message: '사용자 이름은 최소 2자 이상이어야 합니다.' })
    .max(50, { message: '사용자 이름은 최대 50자까지 가능합니다.' }),
  channelId: z.string().min(1, { message: '채널을 선택해주세요.' }),
});

export function UserEntryForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  
  // React Hook Form 설정
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: '',
      channelId: 'general', // 기본 채널 설정
    },
  });

  // 폼 제출 처리
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsLoading(true);
    
    try {
      // 세션 스토리지에 사용자 이름 저장
      sessionStorage.setItem('username', values.username);
      
      // 선택한 채널로 이동
      router.push(`/channel/${values.channelId}`);
    } catch (error) {
      console.error('채팅방 입장 중 오류가 발생했습니다:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">채팅방 입장</CardTitle>
        <CardDescription>
          채팅에 참여하려면 이름을 입력하고 채널을 선택하세요.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>사용자 이름</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="이름을 입력하세요" 
                      {...field} 
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormDescription>
                    채팅방에서 표시될 이름입니다.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="channelId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>채팅 채널</FormLabel>
                  <FormControl>
                    <select 
                      className="w-full p-2 border rounded-md" 
                      {...field}
                      disabled={isLoading}
                    >
                      {DEFAULT_CHANNELS.map(channel => (
                        <option key={channel.id} value={channel.id}>
                          {channel.name}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormDescription>
                    참여할 채팅 채널을 선택하세요.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading}
            >
              {isLoading ? '입장 중...' : '입장하기'}
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex justify-center text-sm text-muted-foreground">
        SSE와 Redis를 이용한 실시간 채팅 서비스
      </CardFooter>
    </Card>
  );
}