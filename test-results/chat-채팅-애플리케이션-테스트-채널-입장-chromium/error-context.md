# Test info

- Name: 채팅 애플리케이션 테스트 >> 채널 입장
- Location: D:\workspace\nextjs-redis-sse\tests\chat.spec.ts:16:7

# Error details

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByLabel('사용자 이름')

    at D:\workspace\nextjs-redis-sse\tests\chat.spec.ts:21:37
```

# Page snapshot

```yaml
- alert
- button "Open Next.js Dev Tools":
  - img
- button "Open issues overlay": 1 Issue
- navigation:
  - button "previous" [disabled]:
    - img "previous"
  - text: 1/1
  - button "next" [disabled]:
    - img "next"
- img
- img
- text: Next.js 15.3.1 Turbopack
- img
- dialog "Build Error":
  - text: Build Error
  - button "Copy Stack Trace":
    - img
  - link "Go to related documentation":
    - /url: https://nextjs.org/docs/messages/module-not-found
    - img
  - link "Learn more about enabling Node.js inspector for server code with Chrome DevTools":
    - /url: https://nextjs.org/docs/app/building-your-application/configuring/debugging#server-side-code
    - img
  - paragraph: "Module not found: Can't resolve '@/components/ui/skeleton'"
  - img
  - text: ./components/forms/user-entry-form.tsx (26:1)
  - button "Open in editor":
    - img
  - text: "Module not found: Can't resolve '@/components/ui/skeleton' 24 | FormMessage, 25 | } from \"@/components/ui/form\" > 26 | import { Skeleton } from \"@/components/ui/skeleton\" | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 27 | 28 | // 폼 유효성 검증 스키마 29 | const formSchema = z.object({ Import map: aliased to relative './components/ui/skeleton' inside of [project]/"
  - link "https://nextjs.org/docs/messages/module-not-found":
    - /url: https://nextjs.org/docs/messages/module-not-found
- contentinfo:
  - paragraph: This error occurred during the build process and can only be dismissed by fixing the error.
```

# Test source

```ts
   1 | import { test, expect } from '@playwright/test';
   2 |
   3 | test.describe('채팅 애플리케이션 테스트', () => {
   4 |   test('메인 페이지 로드', async ({ page }) => {
   5 |     await page.goto('/');
   6 |     
   7 |     // 메인 페이지의 주요 요소 확인
   8 |     await expect(page).toHaveTitle(/채팅/);
   9 |     await expect(page.getByRole('heading')).toContainText('채팅 채널');
  10 |     
  11 |     // 사용자 입장 폼이 존재하는지 확인
  12 |     await expect(page.getByLabel('사용자 이름')).toBeVisible();
  13 |     await expect(page.getByRole('button', { name: '입장하기' })).toBeVisible();
  14 |   });
  15 |
  16 |   test('채널 입장', async ({ page }) => {
  17 |     // 메인 페이지로 이동
  18 |     await page.goto('/');
  19 |     
  20 |     // 사용자 이름 입력 및 채널 선택
> 21 |     await page.getByLabel('사용자 이름').fill('테스트사용자');
     |                                     ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  22 |     await page.getByRole('button', { name: '일반' }).click();
  23 |     await page.getByRole('button', { name: '입장하기' }).click();
  24 |     
  25 |     // 채팅 페이지로 이동했는지 확인
  26 |     await expect(page.url()).toContain('/channel/일반');
  27 |     
  28 |     // 채팅 페이지의 주요 요소 확인
  29 |     await expect(page.getByText('채널: 일반')).toBeVisible();
  30 |     await expect(page.getByPlaceholder('메시지를 입력하세요...')).toBeVisible();
  31 |   });
  32 |
  33 |   test('메시지 전송 및 수신', async ({ page, context }) => {
  34 |     // 첫 번째 사용자로 로그인
  35 |     await page.goto('/');
  36 |     await page.getByLabel('사용자 이름').fill('사용자1');
  37 |     await page.getByRole('button', { name: '일반' }).click();
  38 |     await page.getByRole('button', { name: '입장하기' }).click();
  39 |     
  40 |     // 다른 사용자를 시뮬레이션하기 위한 새 페이지 생성
  41 |     const secondUser = await context.newPage();
  42 |     await secondUser.goto('/');
  43 |     await secondUser.getByLabel('사용자 이름').fill('사용자2');
  44 |     await secondUser.getByRole('button', { name: '일반' }).click();
  45 |     await secondUser.getByRole('button', { name: '입장하기' }).click();
  46 |     
  47 |     // 두 번째 사용자가 메시지 전송
  48 |     await secondUser.getByPlaceholder('메시지를 입력하세요...').fill('안녕하세요!');
  49 |     await secondUser.getByRole('button', { name: '전송' }).click();
  50 |     
  51 |     // 첫 번째 사용자가 메시지 수신 확인
  52 |     await expect(page.getByText('사용자2: 안녕하세요!')).toBeVisible({ timeout: 5000 });
  53 |     
  54 |     // 첫 번째 사용자가 응답
  55 |     await page.getByPlaceholder('메시지를 입력하세요...').fill('반갑습니다!');
  56 |     await page.getByRole('button', { name: '전송' }).click();
  57 |     
  58 |     // 두 번째 사용자가 메시지 수신 확인
  59 |     await expect(secondUser.getByText('사용자1: 반갑습니다!')).toBeVisible({ timeout: 5000 });
  60 |   });
  61 | });
```