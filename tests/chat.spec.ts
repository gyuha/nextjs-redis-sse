import { test, expect, Page } from '@playwright/test';

test.describe('채팅 애플리케이션 테스트', () => {
  // 입장 페이지 테스트
  test('메인 페이지에 접속하고 폼이 표시되는지 확인', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/실시간 채팅/);
    await expect(page.getByText('채널을 선택하고 대화에 참여하세요')).toBeVisible();
    
    // 폼 요소 확인
    await expect(page.locator('input#username')).toBeVisible();
    await expect(page.locator('select#channel')).toBeVisible();
    await expect(page.getByRole('button', { name: '채팅 입장하기' })).toBeVisible();
  });
  
  // 사용자 입력 오류 검증
  test('사용자 이름 또는 채널 선택 없이 제출 시 오류 표시', async ({ page }) => {
    await page.goto('/');
    
    // 입력 없이 제출
    await page.getByRole('button', { name: '채팅 입장하기' }).click();
    
    // 오류 메시지 확인
    await expect(page.getByText('사용자 이름은 최소 2자 이상이어야 합니다.')).toBeVisible();
    await expect(page.getByText('채널을 선택해주세요.')).toBeVisible();
  });
  
  // 채팅방 입장 및 메시지 전송 테스트
  test('채팅방에 입장하고 메시지를 전송', async ({ page, browser }) => {
    // 첫 번째 사용자 (현재 페이지)
    await loginToChatRoom(page, '사용자1', 'general');
    
    // 채팅방 UI 요소 확인
    await expect(page.getByText('#일반')).toBeVisible();
    await expect(page.locator('input[placeholder="메시지 입력..."]')).toBeVisible();
    await expect(page.getByRole('button', { name: '전송' })).toBeVisible();
    
    // 두 번째 사용자 (새 브라우저 컨텍스트)
    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();
    await loginToChatRoom(secondPage, '사용자2', 'general');
    
    // 첫 번째 사용자가 메시지 전송
    const testMessage = '안녕하세요! 테스트 메시지입니다.';
    await page.locator('input[placeholder="메시지 입력..."]').fill(testMessage);
    await page.getByRole('button', { name: '전송' }).click();
    
    // 첫 번째 사용자의 화면에 메시지 표시 확인
    await expect(page.getByText(testMessage)).toBeVisible();
    
    // 두 번째 사용자의 화면에도 메시지 표시 확인
    await expect(secondPage.getByText(testMessage)).toBeVisible({ timeout: 5000 });
    
    // 두 번째 사용자가 응답
    const replyMessage = '반갑습니다!';
    await secondPage.locator('input[placeholder="메시지 입력..."]').fill(replyMessage);
    await secondPage.getByRole('button', { name: '전송' }).click();
    
    // 두 번째 사용자의 메시지가 첫 번째 사용자에게 표시되는지 확인
    await expect(page.getByText(replyMessage)).toBeVisible({ timeout: 5000 });
    
    // 정리
    await secondContext.close();
  });
  
  // 채널 이동 테스트
  test('사이드바를 통한 채널 이동', async ({ page }) => {
    // 채팅방 입장
    await loginToChatRoom(page, '사용자3', 'general');
    
    // 현재 채널 확인
    await expect(page.getByText('#일반')).toBeVisible();
    
    // 사이드바에서 다른 채널 클릭
    await page.getByText('# 랜덤', { exact: false }).click();
    
    // URL 변경 확인
    await expect(page).toHaveURL(/.*\/channel\/random/);
    
    // 새 채널 헤더 표시 확인
    await expect(page.getByText('#랜덤')).toBeVisible();
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