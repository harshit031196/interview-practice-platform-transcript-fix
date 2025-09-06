import { test, expect } from '@playwright/test'

test.describe('Authentication Flow', () => {
  test('should display landing page and open auth modal', async ({ page }) => {
    await page.goto('/')
    
    // Check landing page elements
    await expect(page.locator('h1')).toContainText('Prepare for Difficult Conversations with Wingman')
    await expect(page.getByRole('button', { name: 'Start Practicing Free' })).toBeVisible()
    
    // Open auth modal
    await page.getByRole('button', { name: 'Get Started' }).click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()
    await expect(page.getByText('Welcome to Interview Practice Platform')).toBeVisible()
  })

  test('should allow user signup', async ({ page }) => {
    await page.goto('/')
    
    // Open signup modal
    await page.getByRole('button', { name: 'Get Started' }).click()
    
    // Switch to signup tab
    await page.getByRole('tab', { name: 'Sign Up' }).click()
    
    // Fill signup form
    await page.getByLabel('Full Name').fill('Test User')
    await page.getByLabel('Email').fill('test@example.com')
    await page.getByLabel('Password').fill('password123')
    
    // Note: In a real test, you'd mock the API calls
    // For now, we just test the form validation
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeEnabled()
  })

  test('should allow user signin', async ({ page }) => {
    await page.goto('/')
    
    // Open auth modal
    await page.getByRole('button', { name: 'Get Started' }).click()
    
    // Modal should default to signin tab
    await expect(page.getByRole('tab', { name: 'Sign In', selected: true })).toBeVisible()
    
    // Fill signin form
    await page.getByLabel('Email').fill('pm.candidate@example.com')
    await page.getByLabel('Password').fill('password123')
    
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeEnabled()
  })
})
