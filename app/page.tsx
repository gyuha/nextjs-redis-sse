import { UserEntryForm } from '@/components/forms/user-entry-form';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-b from-background to-secondary/20">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">NextJS Redis SSE 채팅</h1>
          <p className="text-muted-foreground">실시간 채팅 서비스에 오신 것을 환영합니다.</p>
        </div>
        <UserEntryForm />
      </div>
    </div>
  );
}
