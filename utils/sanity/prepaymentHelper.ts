import { Page, expect } from '@playwright/test';
import { CommonHelper } from '../commonHelper';

/**
 * PrePaymentHelper - Handles pre-payment creation and approval workflow
 * 
 * This helper encapsulates all pre-payment operations including:
 * - Navigating to pre-payment section
 * - Creating new pre-payment with service selection
 * - Selecting payment mode and entering rate
 * - Approving pre-payment
 * - Extracting pre-payment number
 */
export class PrePaymentHelper {
  constructor(
    private page: Page,
    private APP_BASE_URL: string
  ) {}

  /**
   * Main method: Create and approve pre-payment
   * @returns Pre-payment number (e.g., "PP-000601")
   */
  async createAndApprovePrePayment(): Promise<string> {
    CommonHelper.logger('INFO', '→ ENTER: createAndApprovePrePayment()');
    
    try {
      // Step 1: Navigate to Pre Payment section
      await this.navigateToPrePayment();

      // Step 2: Create new pre-payment
      await this.createPrePayment();

      // Step 3: Extract pre-payment number
      const prepaymentNumber = await this.extractPrePaymentNumber();

      // Step 4: Navigate to detail page and approve
      await this.approvePrePayment(prepaymentNumber);

      CommonHelper.logger('INFO', `← EXIT: createAndApprovePrePayment() - Success: ${prepaymentNumber}`);
      return prepaymentNumber;
    } catch (error) {
      CommonHelper.logger('ERROR', `← EXIT: createAndApprovePrePayment() - Failed: ${error}`);
      throw error;
    }
  }

  /**
   * Navigate to Pre Payment section from service page
   */
  private async navigateToPrePayment(): Promise<void> {
    CommonHelper.logger('STEP', 'Navigating to Pre Payment section');
    
    const goToCustomerLink = this.page.locator('a', { hasText: 'Go to Customer' });
    await expect(goToCustomerLink).toBeVisible({ timeout: 10000 });
    await goToCustomerLink.click();
    CommonHelper.logger('STEP', 'Clicked Go to Customer link');

    const prePaymentTab = this.page.getByRole('link', { name: 'Pre Payment', exact: true });
    await expect(prePaymentTab).toBeVisible({ timeout: 10000 });
    await prePaymentTab.click();
    CommonHelper.logger('STEP', 'Clicked Pre Payment tab');

    const newPrePaymentLink = this.page.getByRole('link', { name: /New Pre Payment/i });
    await expect(newPrePaymentLink).toBeVisible({ timeout: 10000 });
    await newPrePaymentLink.click();
    CommonHelper.logger('STEP', 'Clicked New Pre Payment link');

    const newPrePaymentHeading = this.page.getByRole('heading', { name: /New Pre Payment/i });
    await expect(newPrePaymentHeading).toBeVisible({ timeout: 15000 });
    CommonHelper.logger('STEP', 'Pre Payment form loaded');
  }

  /**
   * Create pre-payment by selecting service, payment mode, and entering rate
   */
  private async createPrePayment(): Promise<void> {
    CommonHelper.logger('STEP', 'Creating pre-payment');

    // Select service from AJAX dropdown
    await this.selectServiceFromDropdown();

    // Select payment mode
    await this.selectPaymentMode();

    // Enter rate
    await this.enterRate();

    // Click tick button to add item
    await this.clickTickButton();

    // Save pre-payment
    await this.savePrePayment();

    CommonHelper.logger('STEP', 'Pre-payment created successfully');
  }

  /**
   * Select service from dropdown with AJAX search
   */
  private async selectServiceFromDropdown(): Promise<void> {
    CommonHelper.logger('STEP', 'Selecting service from dropdown');
    
    const serviceDropdownButton = this.page.locator('button[data-id="project_id"]');
    
    try {
      await serviceDropdownButton.waitFor({ state: 'visible', timeout: 15000 });
      await serviceDropdownButton.click();
      CommonHelper.logger('STEP', 'Clicked service dropdown button');
      
      const serviceSearchInput = this.page.locator('#project_ajax_search_wrapper .bs-searchbox input');
      await serviceSearchInput.waitFor({ state: 'visible', timeout: 10000 });
      
      // Wait for dropdown to be ready before typing
      await this.page.waitForTimeout(1000);
      
      // Use only a space ' ' to trigger service list
      await serviceSearchInput.type(' ', { delay: 100 });
      CommonHelper.logger('STEP', 'Typed space in service search to trigger AJAX');
      
      // Wait longer for AJAX response in Docker environment
      await this.page.waitForTimeout(2000);
      
      // Wait for options to appear with better error handling
      try {
        await this.page.waitForFunction(() => {
          const options = Array.from(document.querySelectorAll('#project_ajax_search_wrapper .inner.open ul li a span.text'));
          return options.some(opt => opt.textContent && opt.textContent.trim().length > 0);
        }, { timeout: 10000 });
        
        // Log available options for diagnostics
        const options = await this.page.$$eval('#project_ajax_search_wrapper .inner.open ul li a span.text', nodes => nodes.map(n => n.textContent));
        CommonHelper.logger('INFO', `Service options found: ${options.length} items`);
        
        // Click the first non-empty option
        const firstOption = this.page.locator('#project_ajax_search_wrapper .inner.open ul li a span.text').filter({ hasText: /.+/ }).first();
        await firstOption.click();
        CommonHelper.logger('STEP', 'Selected first service option');
      } catch (optionError) {
        // Enhanced diagnostics on failure
        const dropdownHtml = await this.page.locator('#project_ajax_search_wrapper').innerHTML().catch(() => 'Could not capture HTML');
        CommonHelper.logger('ERROR', 'service-dropdown-debug: ' + dropdownHtml.substring(0, 500));
        await CommonHelper.safeScreenshot(this.page, { path: 'service-dropdown-no-options.png', fullPage: true });
        throw new Error('No service options found after space AJAX search. AJAX may have timed out or returned no results.');
      }
    } catch (e) {
      await CommonHelper.safeScreenshot(this.page, { path: 'service-dropdown-arrow-fail.png', fullPage: true });
      CommonHelper.logger('ERROR', 'service-dropdown-arrow-fail: ' + (e as Error).message);
      throw new Error('Service dropdown down arrow or options not visible. Screenshot and HTML saved for debugging.');
    }
  }

  /**
   * Select payment mode from dropdown
   */
  private async selectPaymentMode(): Promise<void> {
    CommonHelper.logger('STEP', 'Selecting payment mode');
    
    const paymentModeSelect = this.page.locator('.modal:visible select[name="custom_fields[credit_note][1]"], select[name="custom_fields[credit_note][1]"]');
    await expect(paymentModeSelect).toBeVisible({ timeout: 10000 });
    
    // Get available options for diagnostics
    const paymentModeOptions = await paymentModeSelect.locator('option').allTextContents();
    
    // Select the first valid option (not empty)
    const validPaymentMode = paymentModeOptions.find(opt => opt && opt.trim().length > 0);
    if (!validPaymentMode) {
      await CommonHelper.safeScreenshot(this.page, { path: 'payment-mode-select-not-found.png', fullPage: true });
      CommonHelper.logger('WARN', 'payment-mode-select-not-found: saved screenshot for debugging');
      throw new Error('No valid Payment Mode options found. Screenshot and HTML saved for debugging.');
    }
    
    await paymentModeSelect.selectOption({ label: validPaymentMode.trim() });
    CommonHelper.logger('STEP', `Selected Payment Mode: ${validPaymentMode.trim()}`);
  }

  /**
   * Enter rate value in the table
   */
  private async enterRate(): Promise<void> {
    CommonHelper.logger('STEP', 'Entering rate value');
    
    let rateInput = this.page.locator('table input[name="rate"]');
    if (await rateInput.count() === 0) {
      rateInput = this.page.locator('table input[placeholder*="Rate" i]');
    }
    if (await rateInput.count() === 0) {
      rateInput = this.page.locator('table input').first();
    }
    
    await expect(rateInput).toBeVisible({ timeout: 10000 });
    await rateInput.fill('100');
    await expect(rateInput).toHaveValue('100', { timeout: 5000 });
    CommonHelper.logger('STEP', 'Entered 100 in Rate field');
  }

  /**
   * Click the blue tick mark button to add item
   */
  private async clickTickButton(): Promise<void> {
    CommonHelper.logger('STEP', 'Clicking tick button to add item');
    
    const tickBtn = this.page.locator('#btnAdditem');
    await expect(tickBtn).toBeVisible({ timeout: 10000 });
    await tickBtn.click();
    CommonHelper.logger('STEP', 'Clicked blue tick mark button');
  }

  /**
   * Save pre-payment and wait for navigation
   */
  private async savePrePayment(): Promise<void> {
    CommonHelper.logger('STEP', 'Saving pre-payment');
    
    const saveBtn = this.page.getByRole('button', { name: /Save/i });
    await expect(saveBtn).toBeVisible({ timeout: 10000 });
    await saveBtn.click();
    CommonHelper.logger('STEP', 'Clicked Save for Pre Payment');
    
    // Wait for navigation to complete after save
    await this.page.waitForURL(/credit_notes/, { timeout: 15000 }).catch(() => {
      CommonHelper.logger('WARN', 'Did not navigate to credit_notes page as expected');
    });
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForLoadState('networkidle').catch(() => {
      CommonHelper.logger('WARN', 'networkidle timeout, proceeding anyway');
    });
    await this.page.waitForTimeout(2000);
    
    CommonHelper.logger('STEP', 'Pre-payment saved and page loaded');
  }

  /**
   * Extract pre-payment number from the page
   * @returns Pre-payment number (e.g., "PP-000601")
   */
  private async extractPrePaymentNumber(): Promise<string> {
    CommonHelper.logger('STEP', 'Extracting pre-payment number');
    
    let prepaymentNumber = '';
    
    try {
      const prepaymentMatch = (await this.page.content()).match(/PP-\d+/);
      if (prepaymentMatch) {
        prepaymentNumber = prepaymentMatch[0];
      } else {
        const urlMatch = this.page.url().match(/credit_notes\/(\d+)/);
        if (urlMatch) {
          const heading = await this.page.locator('h4, h3, h2').first().textContent().catch(() => '');
          const headingMatch = heading?.match(/PP-\d+/);
          if (headingMatch) prepaymentNumber = headingMatch[0];
        }
      }
    } catch (err) {
      CommonHelper.logger('WARN', 'Could not extract prepayment number:', err);
    }
    
    if (prepaymentNumber) {
      CommonHelper.logger('INFO', `Extracted pre-payment number: ${prepaymentNumber}`);
    } else {
      CommonHelper.logger('WARN', 'Pre-payment number not found, will use first prepayment');
    }
    
    return prepaymentNumber;
  }

  /**
   * Navigate to prepayment detail page and approve
   * @param prepaymentNumber - Pre-payment number to approve
   */
  private async approvePrePayment(prepaymentNumber: string): Promise<void> {
    CommonHelper.logger('STEP', 'Navigating to pre-payment detail page for approval');
    
    // Navigate to prepayment detail page
    if (!this.page.url().includes('credit_notes/view')) {
      await this.page.goto(`${this.APP_BASE_URL}/credit_notes`);
      await this.page.waitForLoadState('networkidle');
      await this.page.waitForTimeout(1000);
    }

    // Click on prepayment link
    if (prepaymentNumber) {
      const prepaymentLink = this.page.locator(`a:has-text("${prepaymentNumber}")`).first();
      await expect(prepaymentLink).toBeVisible({ timeout: 10000 });
      await prepaymentLink.click();
      CommonHelper.logger('STEP', `Clicked prepayment link: ${prepaymentNumber}`);
    } else {
      const firstPrepayment = this.page.locator('table tbody tr').first().locator('a').first();
      await firstPrepayment.click();
      CommonHelper.logger('STEP', 'Clicked first prepayment in list');
    }
    
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(1000);

    // Click More dropdown and Approve
    await this.clickMoreDropdown();
    await this.clickApprovePayment();

    CommonHelper.logger('STEP', 'Pre-payment approved successfully');
  }

  /**
   * Click More dropdown with retry logic
   */
  private async clickMoreDropdown(): Promise<void> {
    CommonHelper.logger('STEP', 'Clicking More dropdown');
    
    let moreDropdownClicked = false;
    for (let i = 0; i < 5; i++) {
      try {
        const moreDropdowns = await this.page.locator('button, a', { hasText: 'More' }).elementHandles();
        for (const handle of moreDropdowns) {
          const text = (await handle.textContent())?.trim() || '';
          if (text === 'More') {
            const box = await handle.boundingBox();
            if (box && box.width > 0 && box.height > 0) {
              await handle.click();
              moreDropdownClicked = true;
              CommonHelper.logger('STEP', 'More dropdown clicked successfully');
              break;
            }
          }
        }
        if (moreDropdownClicked) break;
        await this.page.waitForTimeout(1000);
      } catch (err) {
        CommonHelper.logger('WARN', `More dropdown click attempt ${i + 1} failed`);
        await this.page.waitForTimeout(1000);
      }
    }

    if (!moreDropdownClicked) {
      throw new Error('More dropdown not found or not clickable after 5 attempts');
    }
  }

  /**
   * Click Approve Payment button
   */
  private async clickApprovePayment(): Promise<void> {
    CommonHelper.logger('STEP', 'Clicking Approve Payment');
    
    const approvePaymentBtn = this.page.locator('a, button', { hasText: 'Approve Payment' });
    await expect(approvePaymentBtn).toBeVisible({ timeout: 10000 });

    // Setup dialog handler before clicking
    this.page.once('dialog', async dialog => {
      CommonHelper.logger('INFO', 'Accepting approval confirmation dialog');
      await dialog.accept();
    });
    
    await approvePaymentBtn.click();
    CommonHelper.logger('STEP', 'Clicked Approve Payment button');
    
    await this.page.waitForTimeout(2000);
    await this.page.waitForLoadState('networkidle');
    
    CommonHelper.logger('STEP', 'Payment approval completed');
  }
}
