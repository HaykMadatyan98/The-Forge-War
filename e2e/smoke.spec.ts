import { test, expect } from '@playwright/test';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8787/v1';

async function registerAndVerify(request: any, email: string, password: string) {
  const reg = await request.post(`${API}/auth/register`, {
    data: { email, password, displayName: 'E2EPlayer' },
  });
  expect(reg.ok()).toBeTruthy();
  const body = await reg.json();
  const token = body.verifyToken || body.devVerifyToken;
  expect(token).toBeTruthy();
  const verify = await request.post(`${API}/auth/verify-email`, {
    data: { token },
  });
  expect(verify.ok()).toBeTruthy();
  return verify.json();
}

test.describe('boot & hub smoke', () => {
  test('loads title and starts offline campaign', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /The Forge War/i })).toBeVisible();

    const newGame = page.getByRole('button', { name: /New Campaign|Новая кампания/i });
    if (await newGame.isVisible().catch(() => false)) {
      page.once('dialog', (d) => d.accept());
      await newGame.click();
      await expect(page.getByText(/Campaign|Кампания|Quests|Задания/i).first()).toBeVisible({
        timeout: 15_000,
      });
    }
  });

  test('API health responds', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.ok()).toBeTruthy();
  });
});

test.describe('auth → hub → quests', () => {
  test('login opens hub and quests tab', async ({ page, request }) => {
    const email = `e2e_${Date.now()}@test.local`;
    const password = 'TestPass123!';
    await registerAndVerify(request, email, password);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /The Forge War/i })).toBeVisible();

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passInput = page.locator('input[type="password"]').first();
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill(email);
      await passInput.fill(password);
      await page.locator('form').getByRole('button', { name: /Log in|Войти/i }).click();
    }

    await expect(page.getByRole('button', { name: /New Campaign|Новая кампания/i })).toBeVisible({
      timeout: 20_000,
    });

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: /New Campaign|Новая кампания/i }).click();

    const questsBtn = page.getByRole('button', { name: /Quests|Задания/i });
    await expect(questsBtn).toBeVisible({ timeout: 15_000 });
    await questsBtn.click();
    await expect(page.getByText(/Forge a weapon|Сковать оружие/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
