import { expect, Locator, Page } from '@playwright/test';

export class CommonHelper {
  static logger(type: 'INFO' | 'STEP' | 'WARN' | 'ERROR', ...args: any[]): void {
    const now = new Date();
    const timestamp = now.toISOString();
    if (type === 'STEP') {
      if (args.length === 1) {
        console.log(`[STEP] [${timestamp}] --- ${args[0]} ---`);
      } else {
        console.log(`[STEP] [${timestamp}] --- ${args.join(' ')} ---`);
      }
    } else if (type === 'INFO') {
      console.log(`[INFO] [${timestamp}]`, ...args);
    } else if (type === 'WARN') {
      console.log(`[WARN] [${timestamp}]`, ...args);
    } else if (type === 'ERROR') {
      console.log(`[ERROR] [${timestamp}]`, ...args);
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
          await page.screenshot({ path: `fill-fail-${label}-${i}.png`, fullPage: true });
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
          await page.screenshot({ path: `click-fail-${label}-${i}.png`, fullPage: true });
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
          await page.screenshot({ path: `expect-visible-fail-${label}-${i}.png`, fullPage: true });
          require('fs').writeFileSync(`expect-visible-fail-${label}-${i}.html`, await page.content());
          throw new Error(`Failed to expect visible ${label}: ${e}`);
        }
        await page.waitForTimeout(1000);
      }
    }
  }
}
