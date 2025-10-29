import { Page } from '@playwright/test';
import { CommonHelper } from '../utils/commonHelper';
export async function login(page: Page, APP_BASE_URL: string, E2E_USER: string, E2E_PASS: string) {
	CommonHelper.logger('INFO', '→ ENTER: login()');
	try {
		CommonHelper.logger('STEP', 'Login page navigation');
		await page.goto(APP_BASE_URL);
		CommonHelper.logger('STEP', 'Filling login credentials');
		await CommonHelper.resilientFill(page.locator('input[name="email"]'), E2E_USER, page, 'login-email');
		CommonHelper.logger('STEP', 'Filled email');
		await CommonHelper.resilientFill(page.locator('input[name="password"]'), E2E_PASS, page, 'login-password');
		CommonHelper.logger('STEP', 'Filled password');
		await CommonHelper.resilientClick(page.locator('button:has-text("Login")'), page, 'login-button');
		CommonHelper.logger('STEP', 'Clicked login button');
		await CommonHelper.resilientExpectVisible(page.locator('text=Invoices Awaiting Payment'), page, 'login-success');
		CommonHelper.logger('STEP', 'Login success confirmed');
		CommonHelper.logger('INFO', 'Login successful');
		CommonHelper.logger('INFO', '← EXIT: login() - Success');
	} catch (error) {
		CommonHelper.logger('ERROR', `← EXIT: login() - Failed: ${error}`);
		throw error;
	}
}
