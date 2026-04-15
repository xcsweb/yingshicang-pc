import { test, expect } from '@playwright/test';

test.describe('Main Flow', () => {
  test('Settings -> Home -> Detail', async ({ page }) => {
    // 1. Go to Settings page
    await page.goto('/#/settings');
    
    // The page might automatically load mock data if it's localhost,
    // but we will explicitly fill the input to simulate user behavior.
    const input = page.locator('input[type="text"]');
    await input.fill('http://mock.api');
    
    // Click "保存并加载" (Save and load)
    const saveButton = page.locator('button', { hasText: '保存并加载' });
    await saveButton.click();
    
    // Wait for the sites to be loaded (the mock site will be added)
    await expect(page.locator('text=已加载的站点')).toBeVisible();
    await expect(page.locator('text=Mock Site 1')).toBeVisible();

    // 2. Go to Home page
    // Click the back button or navigate directly
    await page.goto('/#/');
    
    // Verify Home page renders video list
    // The mock data contains "测试电影内容 1"
    const movieCard = page.getByRole('heading', { name: '测试电影内容 1', exact: true });
    await expect(movieCard).toBeVisible();

    // 3. Click into Detail page
    await movieCard.click();
    
    // Verify we are on the Detail page
    // The mock data details should render
    await expect(page.locator('h2', { hasText: 'Test Movie' })).toBeVisible();
    
    // Verify "第1集" (Episode 1) button is visible in the playlist
    const ep1Button = page.locator('button', { hasText: '第1集' });
    await expect(ep1Button).toBeVisible();
  });
});
