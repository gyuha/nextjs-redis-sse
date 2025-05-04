import { test, expect, Page } from '@playwright/test';

// SSE 연결 안정성 테스트
test.describe('SSE 연결 안정성 테스트', () => {
  test('채팅방에서 장시간 연결 유지 테스트', async ({ page, browser }) => {
    // 첫 번째 사용자로 채팅방 입장
    await loginToChatRoom(page, '테스터1', 'general');
    
    // 두 번째 사용자 (새 브라우저 컨텍스트)
    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();
    await loginToChatRoom(secondPage, '테스터2', 'general');

    // 연결 안정성 테스트를 위한 시간 설정
    const testDuration = 30000; // 30초
    const messageInterval = 5000; // 5초마다 메시지 전송

    // 연결 시작 시간
    const startTime = Date.now();
    let messageCount = 0;

    // 주기적으로 메시지를 전송하며 연결 안정성 테스트
    while (Date.now() - startTime < testDuration) {
      messageCount++;
      
      // 첫 번째 사용자가 메시지 전송
      const testMessage = `안정성 테스트 메시지 ${messageCount}`;
      await page.locator('input[placeholder="메시지 입력..."]').fill(testMessage);
      await page.getByRole('button', { name: '전송' }).click();
      
      // 두 번째 사용자의 화면에 메시지 표시 확인
      await expect(secondPage.getByText(testMessage)).toBeVisible({ timeout: 3000 });
      
      // 두 번째 사용자가 응답
      const replyMessage = `응답 테스트 메시지 ${messageCount}`;
      await secondPage.locator('input[placeholder="메시지 입력..."]').fill(replyMessage);
      await secondPage.getByRole('button', { name: '전송' }).click();
      
      // 첫 번째 사용자의 화면에 응답 메시지 표시 확인
      await expect(page.getByText(replyMessage)).toBeVisible({ timeout: 3000 });
      
      // 로그 출력
      console.log(`메시지 교환 ${messageCount} 완료 - 경과 시간: ${Date.now() - startTime}ms`);
      
      // 다음 메시지 전송까지 대기 (페이지가 계속 열려있는지 확인)
      if (Date.now() - startTime < testDuration) {
        await page.waitForTimeout(messageInterval);
        
        // 페이지가 올바른 URL에 있는지 확인 (연결이 끊기지 않았는지)
        await expect(page).toHaveURL(/.*\/channel\/general/);
        await expect(secondPage).toHaveURL(/.*\/channel\/general/);
      }
    }
    
    // 로그 출력
    console.log(`안정성 테스트 완료 - 총 ${messageCount}개의 메시지 교환`);
    
    // 정리
    await secondContext.close();
  });

  // 페이지 이동 후 연결 유지 테스트
  test('채널 전환 후 연결 유지 테스트', async ({ page }) => {
    // 채팅방 입장
    await loginToChatRoom(page, '채널전환테스터', 'general');
    
    // 현재 채널 확인
    await expect(page.getByText('#일반')).toBeVisible();
    
    // 첫 채널에서 메시지 전송
    await page.locator('input[placeholder="메시지 입력..."]').fill('일반 채널 테스트 메시지');
    await page.getByRole('button', { name: '전송' }).click();
    
    // 메시지가 표시되는지 확인
    await expect(page.getByText('일반 채널 테스트 메시지')).toBeVisible();
    
    // 사이드바에서 다른 채널 클릭
    await page.getByText('# 랜덤', { exact: false }).click();
    
    // URL 변경 확인
    await expect(page).toHaveURL(/.*\/channel\/random/);
    
    // 새 채널 헤더 표시 확인
    await expect(page.getByText('#랜덤')).toBeVisible();
    
    // 새 채널에서 메시지 전송
    await page.locator('input[placeholder="메시지 입력..."]').fill('랜덤 채널 테스트 메시지');
    await page.getByRole('button', { name: '전송' }).click();
    
    // 메시지가 표시되는지 확인
    await expect(page.getByText('랜덤 채널 테스트 메시지')).toBeVisible();
    
    // 원래 채널로 돌아가기
    await page.getByText('# 일반', { exact: false }).click();
    
    // URL 변경 확인
    await expect(page).toHaveURL(/.*\/channel\/general/);
    
    // 이전에 보낸 메시지가 여전히 보이는지 확인
    await expect(page.getByText('일반 채널 테스트 메시지')).toBeVisible();
  });
});

// 채팅방 입장 도우미 함수
async function loginToChatRoom(page: Page, username: string, channel: string) {
  await page.goto('/');
  await page.locator('input#username').fill(username);
  await page.locator('select#channel').selectOption(channel);
  await page.getByRole('button', { name: '채팅 입장하기' }).click();
  
  // 채팅방으로 이동했는지 확인
  await expect(page).toHaveURL(new RegExp(`.*\\/channel\\/${channel}.*username=${username}`));
}