import { test, expect, Page } from '@playwright/test';

test.describe('채널 전환 테스트', () => {
  // 첫 번째 사용자가 채널에 입장하는 함수
  async function loginFirstUser(page: Page, username: string, channel: string) {
    await page.goto('/');
    await page.locator('input#username').fill(username);
    await page.locator('select#channel').selectOption(channel);
    await page.getByRole('button', { name: '채팅 입장하기' }).click();
    
    // 채팅방으로 이동했는지 확인
    await expect(page).toHaveURL(new RegExp(`.*\\/channel\\/${channel}.*username=${username}`));
  }
  
  // 두 번째 사용자가 채널에 입장하는 함수
  async function loginSecondUser(page: Page, username: string, channel: string) {
    await page.goto('/');
    await page.locator('input#username').fill(username);
    await page.locator('select#channel').selectOption(channel);
    await page.getByRole('button', { name: '채팅 입장하기' }).click();
    
    // 채팅방으로 이동했는지 확인
    await expect(page).toHaveURL(new RegExp(`.*\\/channel\\/${channel}.*username=${username}`));
  }
  
  // 채널 이동 테스트
  test('다른 사용자가 로그인하고 있을 때 채널 이동이 정상적으로 작동해야 함', async ({ browser }) => {
    // 첫 번째 사용자의 컨텍스트 및 페이지 생성
    const firstContext = await browser.newContext();
    const firstPage = await firstContext.newPage();
    await loginFirstUser(firstPage, '사용자1', 'general');
    
    // 첫 번째 사용자가 성공적으로 general 채널에 접속했는지 확인
    await expect(firstPage.getByText('#일반')).toBeVisible();
    
    // 두 번째 사용자의 컨텍스트 및 페이지 생성
    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();
    await loginSecondUser(secondPage, '사용자2', 'random');
    
    // 두 번째 사용자가 성공적으로 random 채널에 접속했는지 확인
    await expect(secondPage.getByText('#랜덤')).toBeVisible();
    
    // 첫 번째 사용자가 다른 채널(random)로 이동
    await firstPage.getByText('# 랜덤').click();
    
    // 첫 번째 사용자의 URL이 변경되었는지 확인
    await expect(firstPage).toHaveURL(/.*\/channel\/random/);
    
    // 첫 번째 사용자의 화면에 새 채널 헤더가 표시되는지 확인
    await expect(firstPage.getByText('#랜덤')).toBeVisible({ timeout: 5000 });
    
    // 첫 번째 사용자가 메시지를 전송
    const testMessage = '안녕하세요! random 채널입니다.';
    await firstPage.locator('input[placeholder="메시지 입력..."]').fill(testMessage);
    await firstPage.getByRole('button', { name: '전송' }).click();
    
    // 첫 번째 사용자가 메시지를 보냈는지 확인
    await expect(firstPage.getByText(testMessage)).toBeVisible();
    
    // 같은 채널(random)에 있는 두 번째 사용자에게 메시지가 표시되는지 확인
    await expect(secondPage.getByText(testMessage)).toBeVisible({ timeout: 5000 });
    
    // 두 번째 사용자가 다른 채널(general)로 이동
    await secondPage.getByText('# 일반').click();
    
    // 두 번째 사용자의 URL이 변경되었는지 확인
    await expect(secondPage).toHaveURL(/.*\/channel\/general/);
    
    // 두 번째 사용자의 화면에 새 채널 헤더가 표시되는지 확인
    await expect(secondPage.getByText('#일반')).toBeVisible({ timeout: 5000 });
    
    // 두 번째 사용자가 메시지를 전송
    const testMessage2 = '안녕하세요! general 채널입니다.';
    await secondPage.locator('input[placeholder="메시지 입력..."]').fill(testMessage2);
    await secondPage.getByRole('button', { name: '전송' }).click();
    
    // 두 번째 사용자가 메시지를 보냈는지 확인
    await expect(secondPage.getByText(testMessage2)).toBeVisible();
    
    // 첫 번째 사용자가 다시 general 채널로 이동
    await firstPage.getByText('# 일반').click();
    
    // 첫 번째 사용자의 URL이 변경되었는지 확인
    await expect(firstPage).toHaveURL(/.*\/channel\/general/);
    
    // 첫 번째 사용자의 화면에 새 채널 헤더가 표시되는지 확인
    await expect(firstPage.getByText('#일반')).toBeVisible({ timeout: 5000 });
    
    // 첫 번째 사용자에게 두 번째 사용자의 메시지가 표시되는지 확인
    await expect(firstPage.getByText(testMessage2)).toBeVisible({ timeout: 5000 });
    
    // 정리
    await firstContext.close();
    await secondContext.close();
  });

  test('여러 사용자가 로그인하고 다른 채널로 전환할 때 문제 없이 작동해야 함', async ({ browser }) => {
    // 첫 번째 사용자 (Chrome)
    const user1Context = await browser.newContext();
    const user1Page = await user1Context.newPage();
    
    // 두 번째 사용자 (다른 브라우저 세션)
    const user2Context = await browser.newContext();
    const user2Page = await user2Context.newPage();
    
    // 사용자 1이 첫 번째 채널에 입장
    await user1Page.goto('/');
    await user1Page.waitForLoadState('networkidle');
    
    // 채널 선택 및 이름 입력
    await user1Page.selectOption('select[name="channel"]', 'general');
    await user1Page.fill('input[name="username"]', '사용자1');
    await user1Page.click('button[type="submit"]');
    
    // 채팅 페이지로 이동했는지 확인
    await user1Page.waitForURL(/\/channel\/general/);
    
    // 페이지가 완전히 로드될 때까지 기다림
    await user1Page.waitForSelector('header h1:has-text("#일반")');
    await user1Page.waitForSelector('span:has-text("연결됨")');
    
    // 사용자 2가 두 번째 채널에 입장
    await user2Page.goto('/');
    await user2Page.waitForLoadState('networkidle');
    
    // 채널 선택 및 이름 입력
    await user2Page.selectOption('select[name="channel"]', 'random');
    await user2Page.fill('input[name="username"]', '사용자2');
    await user2Page.click('button[type="submit"]');
    
    // 채팅 페이지로 이동했는지 확인
    await user2Page.waitForURL(/\/channel\/random/);
    
    // 페이지가 완전히 로드될 때까지 기다림
    await user2Page.waitForSelector('header h1:has-text("#랜덤")');
    await user2Page.waitForSelector('span:has-text("연결됨")');
    
    // 사용자 1이 메시지 전송
    await user1Page.fill('textarea[placeholder*="메시지"]', '안녕하세요! 일반 채널입니다.');
    await user1Page.press('textarea[placeholder*="메시지"]', 'Enter');
    
    // 메시지가 표시되는지 확인
    await user1Page.waitForSelector('div[class*="message"]:has-text("안녕하세요! 일반 채널입니다.")');
    
    // 사용자 2가 메시지 전송
    await user2Page.fill('textarea[placeholder*="메시지"]', '안녕하세요! 랜덤 채널입니다.');
    await user2Page.press('textarea[placeholder*="메시지"]', 'Enter');
    
    // 메시지가 표시되는지 확인
    await user2Page.waitForSelector('div[class*="message"]:has-text("안녕하세요! 랜덤 채널입니다.")');
    
    // 사용자 1이 채널 전환 (사이드바의 채널 링크 클릭)
    await user1Page.click('a[href*="random"]');
    
    // 사용자 1이 새 채널로 이동했는지 확인
    await user1Page.waitForURL(/\/channel\/random/);
    await user1Page.waitForSelector('header h1:has-text("#랜덤")');
    
    // 연결 상태 확인 - 여기서 이전에는 멈추는 현상이 발생했음
    await user1Page.waitForSelector('span:has-text("연결됨")', { timeout: 10000 });
    
    // 이전에 사용자 2가 보낸 메시지가 표시되는지 확인
    await user1Page.waitForSelector('div[class*="message"]:has-text("안녕하세요! 랜덤 채널입니다.")', { timeout: 5000 });
    
    // 사용자 1이 새 채널에서 메시지 전송
    await user1Page.fill('textarea[placeholder*="메시지"]', '저도 랜덤 채널에 왔어요!');
    await user1Page.press('textarea[placeholder*="메시지"]', 'Enter');
    
    // 메시지가 표시되는지 확인 (사용자 1과 사용자 2 모두)
    await user1Page.waitForSelector('div[class*="message"]:has-text("저도 랜덤 채널에 왔어요!")', { timeout: 5000 });
    await user2Page.waitForSelector('div[class*="message"]:has-text("저도 랜덤 채널에 왔어요!")', { timeout: 5000 });
    
    // 사용자 2가 채널 전환
    await user2Page.click('a[href*="help"]');
    
    // 사용자 2가 새 채널로 이동했는지 확인
    await user2Page.waitForURL(/\/channel\/help/);
    await user2Page.waitForSelector('header h1:has-text("#도움말")');
    
    // 연결 상태 확인
    await user2Page.waitForSelector('span:has-text("연결됨")', { timeout: 10000 });
    
    // 사용자 2가 새 채널에서 메시지 전송
    await user2Page.fill('textarea[placeholder*="메시지"]', '도움말 채널에 오신 것을 환영합니다!');
    await user2Page.press('textarea[placeholder*="메시지"]', 'Enter');
    
    // 메시지가 표시되는지 확인
    await user2Page.waitForSelector('div[class*="message"]:has-text("도움말 채널에 오신 것을 환영합니다!")', { timeout: 5000 });
    
    // 사용자 1과 2가 동시에 같은 채널로 전환
    await user1Page.click('a[href*="help"]');
    
    // 사용자 1이 새 채널로 이동했는지 확인
    await user1Page.waitForURL(/\/channel\/help/);
    await user1Page.waitForSelector('header h1:has-text("#도움말")');
    
    // 연결 상태 확인
    await user1Page.waitForSelector('span:has-text("연결됨")', { timeout: 10000 });
    
    // 사용자 2의 메시지가 사용자 1에게도 표시되는지 확인
    await user1Page.waitForSelector('div[class*="message"]:has-text("도움말 채널에 오신 것을 환영합니다!")', { timeout: 5000 });
    
    // 사용자 1이 메시지 전송
    await user1Page.fill('textarea[placeholder*="메시지"]', '도움말 채널에서 만나서 반가워요!');
    await user1Page.press('textarea[placeholder*="메시지"]', 'Enter');
    
    // 메시지가 양쪽 모두에 표시되는지 확인
    await user1Page.waitForSelector('div[class*="message"]:has-text("도움말 채널에서 만나서 반가워요!")', { timeout: 5000 });
    await user2Page.waitForSelector('div[class*="message"]:has-text("도움말 채널에서 만나서 반가워요!")', { timeout: 5000 });
    
    // 테스트 종료
    await user1Context.close();
    await user2Context.close();
  });
});