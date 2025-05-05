'use client'

import { useState } from 'react'
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Skeleton } from "@/components/ui/skeleton"

// 폼 유효성 검증 스키마
const formSchema = z.object({
  username: z
    .string()
    .min(2, { message: '사용자 이름은 2글자 이상이어야 합니다.' })
    .max(20, { message: '사용자 이름은 20글자 이하여야 합니다.' })
    .regex(/^[가-힣a-zA-Z0-9_-]+$/, {
      message: '사용자 이름은 한글, 영문, 숫자, 밑줄, 하이픈만 포함할 수 있습니다.'
    }),
  channelId: z.string().min(1, { message: '채널을 선택해주세요.' }),
})

// 폼 값 타입
type FormValues = z.infer<typeof formSchema>

// 컴포넌트 Props
interface UserEntryFormProps {
  onSubmit: (username: string, channelId: string) => void
  channels: Array<{ id: string; name: string; userCount: number }>
  isLoading: boolean
}

export default function UserEntryForm({ onSubmit, channels, isLoading }: UserEntryFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: '',
      channelId: channels.length > 0 ? channels[0].id : '',
    },
  })

  const handleSubmit = form.handleSubmit(({ username, channelId }) => {
    onSubmit(username.trim(), channelId)
  })

  // 로딩 중 표시를 위한 플레이스홀더
  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle><Skeleton className="h-8 w-3/4" /></CardTitle>
          <CardDescription><Skeleton className="h-4 w-full" /></CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
        <CardFooter>
          <Skeleton className="h-10 w-full" />
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>채팅 입장</CardTitle>
        <CardDescription>
          채팅에 참여하려면 사용자 이름을 입력하고 채널을 선택하세요.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
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
                      autoComplete="off"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="channelId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>채널</FormLabel>
                  <FormControl>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      {...field}
                    >
                      {channels.length === 0 ? (
                        <option value="">사용 가능한 채널 없음</option>
                      ) : (
                        channels.map((channel) => (
                          <option key={channel.id} value={channel.id}>
                            {channel.name} ({channel.userCount}명 접속 중)
                          </option>
                        ))
                      )}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter>
            <Button 
              type="submit" 
              className="w-full"
              disabled={channels.length === 0 || form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "입장 중..." : "채팅 입장"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  )
}