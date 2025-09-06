import { test, expect } from '@playwright/test'

test.describe('Dashboard Flow', () => {
  test('should display dashboard after login', async ({ page }) => {
    // Mock authentication state
    await page.goto('/dashboard')
    
    // Check dashboard elements
    await expect(page.locator('h1')).toContainText('Welcome back')
    await expect(page.getByText('Conversation Readiness')).toBeVisible()
    await expect(page.getByText('AI Practice Sessions')).toBeVisible()
    await expect(page.getByText('Book an Expert')).toBeVisible()
  })

  test('should navigate to AI practice from dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    
    await page.getByRole('button', { name: 'Start Practice' }).click()
    await expect(page).toHaveURL('/practice/ai')
    await expect(page.locator('h1')).toContainText('AI Interview Practice')
  })

  test('should navigate to experts page', async ({ page }) => {
    await page.goto('/dashboard')
    
    await page.getByText('Book an Expert').click()
    await expect(page).toHaveURL('/experts')
    await expect(page.locator('h1')).toContainText('Expert Interviewers')
  })
})
