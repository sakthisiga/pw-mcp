import { expect, Locator, Page } from '@playwright/test';

export class CommonHelper {
  static logger(type: 'INFO' | 'STEP' | 'WARN' | 'ERROR', ...args: any[]): void {
    const now = new Date();
    const timestamp = now.toISOString();
    if (type === 'STEP') {
      if (args.length === 1) {
        console.log(`[STEP] [${timestamp}] ${args[0]}`);
      } else {
        console.log(`[STEP] [${timestamp}] ${args.join(' ')}`);
      }
    } else if (type === 'INFO') {
      console.log(`[INFO] [${timestamp}]`, ...args);
    } else if (type === 'WARN') {
      console.log(`[WARN] [${timestamp}]`, ...args);
    } else if (type === 'ERROR') {
      console.log(`[ERROR] [${timestamp}]`, ...args);
    }
  }

  /**
   * Safely take a screenshot, handling cases where page/context is closed
   * Useful when test times out and browser is already closed
   */
  static async safeScreenshot(page: Page, options: { path: string; fullPage?: boolean }): Promise<boolean> {
    try {
      await page.screenshot(options);
      return true;
    } catch (err) {
      CommonHelper.logger('WARN', `Failed to take screenshot (${options.path}) - page/context may be closed:`, String(err));
      return false;
    }
  }

  static async resilientFill(locator: Locator, value: string, page: Page, label: string, retries = 3): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        await locator.fill(value);
        await expect(locator).toHaveValue(value, { timeout: 5000 });
        return;
      } catch (e) {
        if (i === retries - 1) {
          await CommonHelper.safeScreenshot(page, { path: `fill-fail-${label}-${i}.png`, fullPage: true });
          require('fs').writeFileSync(`fill-fail-${label}-${i}.html`, await page.content());
          throw new Error(`Failed to fill ${label}: ${e}`);
        }
        await page.waitForTimeout(1000);
      }
    }
  }

  static async resilientClick(locator: Locator, page: Page, label: string, retries = 3): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        await expect(locator).toBeVisible({ timeout: 5000 });
        await locator.click();
        return;
      } catch (e) {
        if (i === retries - 1) {
          await CommonHelper.safeScreenshot(page, { path: `click-fail-${label}-${i}.png`, fullPage: true });
          require('fs').writeFileSync(`click-fail-${label}-${i}.html`, await page.content());
          throw new Error(`Failed to click ${label}: ${e}`);
        }
        await page.waitForTimeout(1000);
      }
    }
  }

  static async resilientExpectVisible(locator: Locator, page: Page, label: string, retries = 3): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        await expect(locator).toBeVisible({ timeout: 5000 });
        return;
      } catch (e) {
        if (i === retries - 1) {
          await CommonHelper.safeScreenshot(page, { path: `expect-visible-fail-${label}-${i}.png`, fullPage: true });
          require('fs').writeFileSync(`expect-visible-fail-${label}-${i}.html`, await page.content());
          throw new Error(`Failed to expect visible ${label}: ${e}`);
        }
        await page.waitForTimeout(1000);
      }
    }
  }
}
