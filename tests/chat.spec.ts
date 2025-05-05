import { test, expect } from '@playwright/test';

test.describe('채팅 애플리케이션 테스트', () => {
  test('메인 페이지 로드', async ({ page }) => {
    await page.goto('/');
    
    // 메인 페이지의 주요 요소 확인
    await expect(page).toHaveTitle(/실시간 채팅 애플리케이션/);
    await expect(page.getByText('채팅 입장')).toBeVisible();
    
    // 사용자 입장 폼이 존재하는지 확인
    await expect(page.getByText('사용자 이름')).toBeVisible();
    await expect(page.getByRole('button', { name: /채팅 입장/ })).toBeVisible();
  });

  test('채널 입장', async ({ page }) => {
    // 메인 페이지로 이동
    await page.goto('/');
    
    // 사용자 이름 입력
    await page.getByLabel('사용자 이름').fill('테스트사용자');
    
    // 채널 선택 - select 요소를 사용
    await page.selectOption('select', { index: 0 }); // 첫 번째 채널 선택
    
    // 입장하기 버튼 클릭
    await page.getByRole('button', { name: /채팅 입장/ }).click();
    
    // 채팅 페이지로 이동했는지 확인
    // URL 패턴은 /channel/{channelId} 형태가 될 것입니다
    await expect(page.url()).toContain('/channel/');
    
    // 채팅 입력 필드 확인
    await expect(page.getByPlaceholder('메시지를 입력하세요...')).toBeVisible({ timeout: 5000 });
  });

  test('메시지 전송 및 수신', async ({ page, context }) => {
    // 첫 번째 사용자로 로그인
    await page.goto('/');
    await page.getByLabel('사용자 이름').fill('사용자1');
    await page.selectOption('select', { index: 0 }); // 첫 번째 채널 선택
    await page.getByRole('button', { name: /채팅 입장/ }).click();
    
    // 다른 사용자를 시뮬레이션하기 위한 새 페이지 생성
    const secondUser = await context.newPage();
    await secondUser.goto('/');
    await secondUser.getByLabel('사용자 이름').fill('사용자2');
    await secondUser.selectOption('select', { index: 0 }); // 첫 번째 채널 선택
    await secondUser.getByRole('button', { name: /채팅 입장/ }).click();
    
    // 두 번째 사용자가 메시지 전송
    await secondUser.getByPlaceholder('메시지를 입력하세요...').fill('안녕하세요!');
    await secondUser.getByRole('button', { name: '전송' }).click();
    
    // 첫 번째 사용자가 메시지 수신 확인
    await expect(page.getByText('사용자2: 안녕하세요!')).toBeVisible({ timeout: 10000 });
    
    // 첫 번째 사용자가 응답
    await page.getByPlaceholder('메시지를 입력하세요...').fill('반갑습니다!');
    await page.getByRole('button', { name: '전송' }).click();
    
    // 두 번째 사용자가 메시지 수신 확인
    await expect(secondUser.getByText('사용자1: 반갑습니다!')).toBeVisible({ timeout: 10000 });
  });
});