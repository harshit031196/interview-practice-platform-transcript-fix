import { test, expect } from '@playwright/test'

test.describe('AI Practice Flow', () => {
  test('should configure and start AI interview session', async ({ page }) => {
    await page.goto('/practice/ai')
    
    // Check page elements
    await expect(page.locator('h1')).toContainText('AI Interview Practice')
    await expect(page.getByText('Interview Type')).toBeVisible()
    
    // Select interview type
    await page.getByText('Behavioral').first().click()
    await expect(page.locator('.border-primary')).toContainText('Behavioral')
    
    // Select difficulty
    await page.getByText('Medium').first().click()
    
    // Adjust duration
    await expect(page.getByText(/Duration: \d+ minutes/)).toBeVisible()
    
    // Check session cost
    await expect(page.getByText(/\d+ credits/)).toBeVisible()
    
    // Start button should be enabled after selections
    await expect(page.getByRole('button', { name: 'Start Interview' })).toBeEnabled()
  })

  test('should show permissions and setup info', async ({ page }) => {
    await page.goto('/practice/ai')
    
    // Check permissions section
    await expect(page.getByText('Before You Start')).toBeVisible()
    await expect(page.getByText('Microphone access required')).toBeVisible()
    await expect(page.getByText('Find a quiet environment')).toBeVisible()
  })

  test('should validate required fields', async ({ page }) => {
    await page.goto('/practice/ai')
    
    // Start button should be disabled initially
    await expect(page.getByRole('button', { name: 'Start Interview' })).toBeDisabled()
    
    // Select only interview type
    await page.getByText('Technical').first().click()
    await expect(page.getByRole('button', { name: 'Start Interview' })).toBeDisabled()
    
    // Select difficulty - now should be enabled
    await page.getByText('Hard').first().click()
    await expect(page.getByRole('button', { name: 'Start Interview' })).toBeEnabled()
  })
})
