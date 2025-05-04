'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

interface ErrorFallbackProps {
  error: Error | string;
  resetErrorBoundary?: () => void;
  retry?: () => void;
}

export function ErrorFallback({ error, resetErrorBoundary, retry }: ErrorFallbackProps) {
  const router = useRouter();
  
  const handleRetry = () => {
    if (retry) {
      retry();
    } else if (resetErrorBoundary) {
      resetErrorBoundary();
    } else {
      // 새로고침 시도
      window.location.reload();
    }
  };
  
  const handleGoHome = () => {
    router.push('/');
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-center min-h-[300px] p-6"
    >
      <Card className="w-full max-w-md p-6 bg-white dark:bg-gray-800 shadow-lg">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900 text-red-500 mb-4">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-8 w-8" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-2">오류가 발생했습니다</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            {typeof error === 'string' ? error : error.message || '알 수 없는 오류가 발생했습니다.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={handleRetry} variant="default">
              다시 시도
            </Button>
            <Button onClick={handleGoHome} variant="outline">
              홈으로 돌아가기
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}