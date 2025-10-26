import { Page, expect } from '@playwright/test';
import { CommonHelper } from '../commonHelper';
import { readAbisExecutionDetails, writeAbisExecutionDetails } from './jsonWriteHelper';

/**
 * InvoiceHelper - Handles complete Invoice workflow from conversion to payment approval
 * 
 * @class InvoiceHelper
 * @description Manages the full invoice lifecycle including:
 * - Converting Proforma to Invoice
 * - Extracting and storing invoice details
 * - Applying credits to reduce invoice amount
 * - Recording payment with transaction details
 * - Approving payment through workflow
 * - Navigating back to invoice page
 * 
 * @example
 * ```typescript
 * const invoiceHelper = new InvoiceHelper(page);
 * await invoiceHelper.processInvoiceWorkflow();
 * ```
 * 
 * Main Workflow:
 * 1. Convert Proforma to Invoice
 * 2. Extract Invoice details (number, date, due date, sales agent, total)
 * 3. Apply Credits (reduce invoice amount)
 * 4. Record Payment with transaction details
 * 5. Approve Payment through More dropdown
 * 6. Navigate back to Invoice via payment link
 * 
 * @author ABIS Test Automation Team
 * @version 1.0.0
 */
export class InvoiceHelper {
  /**
   * Creates an instance of InvoiceHelper
   * @param {Page} page - Playwright Page object for browser interactions
   */
  constructor(private page: Page) {}

  /**
   * Executes the complete invoice workflow from conversion to approval
   * 
   * @async
   * @returns {Promise<void>}
   * @throws {Error} If any step in the invoice workflow fails
   * 
   * @description This is the main orchestration method that:
   * 1. Converts Proforma to Invoice
   * 2. Captures invoice details and saves to JSON
   * 3. Applies credits to invoice
   * 4. Records payment with random transaction ID
   * 5. Approves the payment
   * 6. Navigates back to invoice page
   * 
   * @example
   * ```typescript
   * const invoiceHelper = new InvoiceHelper(page);
   * await invoiceHelper.processInvoiceWorkflow();
   * // Invoice created, payment recorded and approved
   * ```
   */
  async processInvoiceWorkflow(): Promise<void> {
    await this.convertProformaToInvoice();
    await this.captureInvoiceDetails();
    await this.applyCredits();
    await this.recordPayment();
    await this.approvePayment();
    await this.navigateBackToInvoice();
  }

  /**
   * Converts an accepted Proforma to an Invoice
   * 
   * @async
   * @private
   * @returns {Promise<void>}
   * @throws {Error} If conversion fails or success indicator not found
   * 
   * @description Performs the following steps:
   * 1. Waits for page stability after Proforma save
   * 2. Clicks "Convert to Invoice" dropdown button (retries up to 5 times)
   * 3. Selects "Convert" option from dropdown
   * 4. Waits for navigation or success indicator (toast/alert)
   * 5. Takes screenshot on failure for debugging
   * 
   * @example
   * ```typescript
   * await this.convertProformaToInvoice();
   * // Proforma is now converted to Invoice
   * ```
   */
  private async convertProformaToInvoice(): Promise<void> {
    try {
      // Wait for page to be stable after Proforma save
      await this.page.waitForLoadState('networkidle');
      await this.page.waitForTimeout(1000);

      // Click "Convert to Invoice" dropdown button
      const convertDropdownBtn = this.page.locator('button', { hasText: /Convert to Invoice/i });
      let convertDropdownClicked = false;
      
      for (let i = 0; i < 5; i++) {
        if (await convertDropdownBtn.count() && await convertDropdownBtn.isVisible()) {
          await convertDropdownBtn.click();
          convertDropdownClicked = true;
          CommonHelper.logger('STEP', 'Clicked Convert to Invoice dropdown button');
          break;
        }
        await this.page.waitForTimeout(1000);
      }

      if (!convertDropdownClicked) {
        CommonHelper.logger('WARN', 'Could not find or click Convert to Invoice dropdown button');
        throw new Error('Convert to Invoice dropdown button not found');
      }

      // Click "Convert" option in the dropdown
      const convertOptionBtn = this.page.locator('a, button', { hasText: /^Convert$/i });
      await expect(convertOptionBtn).toBeVisible({ timeout: 10000 });
      await convertOptionBtn.click();
      CommonHelper.logger('STEP', 'Clicked Convert option in dropdown');

      // Wait for navigation or success indicator
      await Promise.race([
        this.page.waitForNavigation({ timeout: 10000 }),
        this.page.waitForSelector('.toast-success, .alert-success, .notification-success', { timeout: 10000 }),
        this.page.waitForSelector('text=Invoice created successfully', { timeout: 10000 })
      ]);
      
      CommonHelper.logger('INFO', 'Invoice conversion success confirmed');
      await this.page.waitForTimeout(2000);
    } catch (err) {
      CommonHelper.logger('ERROR', 'Error during Convert to invoice workflow:', err);
      if (!this.page.isClosed()) {
        await this.page.screenshot({ path: 'convert-to-invoice-failed.png', fullPage: true });
      }
      throw err;
    }
  }

  /**
   * Extracts invoice details from the page and saves to JSON file
   * 
   * @async
   * @private
   * @returns {Promise<void>}
   * 
   * @description Uses node-html-parser to extract:
   * - Invoice Number (from span#invoice-number or regex pattern)
   * - Invoice Date (from bold label or regex)
   * - Due Date (from bold label or regex)
   * - Sales Agent (from bold label or regex)
   * - Total Amount (from table rows, excluding Sub Total/Grand Total)
   * 
   * All extracted values are written to abis_execution_details.json under the 'invoice' key.
   * Takes a diagnostic screenshot if any required field is missing.
   * 
   * @example
   * ```typescript
   * await this.captureInvoiceDetails();
   * // Invoice details saved to JSON file
   * ```
   */
  private async captureInvoiceDetails(): Promise<void> {
    const invoicePageContent = await this.page.content();
    const domParser = require('node-html-parser');
    const root = domParser.parse(invoicePageContent);

    // Extract Invoice Number
    let invoiceNumber = '';
    const invoiceNumberSpan = root.querySelector('span#invoice-number');
    if (invoiceNumberSpan) {
      invoiceNumber = invoiceNumberSpan.text.trim();
    } else {
      const fallbackMatch = invoicePageContent.match(/[A-Z]{2,5}-\d{3,}/);
      if (fallbackMatch) invoiceNumber = fallbackMatch[0];
    }

    // Helper function to extract value after bold label
    const extractAfterBold = (root: any, label: string): string => {
      const spans = root.querySelectorAll('span.bold');
      for (const span of spans) {
        if (span.text.trim().replace(/\s+/g, ' ') === label) {
          const parentP = span.parentNode;
          if (parentP && parentP.text) {
            return parentP.text.replace(label, '').trim();
          }
        }
      }
      return '';
    };

    // Extract Invoice Date
    let invoiceDate = extractAfterBold(root, 'Invoice Date:');
    if (!invoiceDate) {
      const invoiceDateMatch = invoicePageContent.match(/Invoice Date:\s*([\d]{2}-[\d]{2}-[\d]{4})/);
      if (invoiceDateMatch) invoiceDate = invoiceDateMatch[1];
    }

    // Extract Due Date
    let dueDate = extractAfterBold(root, 'Due Date:');
    if (!dueDate) {
      const dueDateMatch = invoicePageContent.match(/Due Date:\s*([\d]{2}-[\d]{2}-[\d]{4})/);
      if (dueDateMatch) dueDate = dueDateMatch[1];
    }

    // Extract Sales Agent
    let salesAgent = extractAfterBold(root, 'Sale Agent:');
    if (!salesAgent) {
      const salesAgentMatch = invoicePageContent.match(/Sale Agent:\s*([A-Za-z .]+)/);
      if (salesAgentMatch) salesAgent = salesAgentMatch[1].trim();
    }

    // Extract Total
    let invoiceTotal = '';
    try {
      if (!this.page.isClosed()) {
        const totalRows = await this.page.locator('tr:has-text("Total")').all();
        let bestTotal = '';
        for (const row of totalRows) {
          const rowText = await row.textContent();
          if (rowText && /Total/i.test(rowText) && !/Sub Total|Grand Total/i.test(rowText)) {
            const directMatch = rowText.match(/Total[^\d]*(\d{1,3}(,\d{3})*(\.\d{2}))/);
            if (directMatch) {
              bestTotal = directMatch[1];
              break;
            }
            const currencyMatches = rowText.match(/\d{1,3}(,\d{3})*(\.\d{2})?/g);
            if (!bestTotal && currencyMatches && currencyMatches.length > 0) {
              bestTotal = currencyMatches[0];
            }
          }
        }
        if (!bestTotal) {
          const totalLabelRegex = /Total[^\d]*(\d{1,3}(,\d{3})*(\.\d{2}))/i;
          const match = invoicePageContent.match(totalLabelRegex);
          if (match) bestTotal = match[1];
        }
        invoiceTotal = bestTotal;
      }
    } catch (err) {
      CommonHelper.logger('WARN', 'Could not find Invoice total:', err);
    }

    // Write to JSON file
    try {
      const detailsJson = readAbisExecutionDetails();
      detailsJson.invoice = detailsJson.invoice || {};
      detailsJson.invoice.invoiceNumber = invoiceNumber;
      detailsJson.invoice.invoiceDate = invoiceDate;
      detailsJson.invoice.dueDate = dueDate;
      detailsJson.invoice.salesAgent = salesAgent;
      detailsJson.invoice.total = invoiceTotal;
      writeAbisExecutionDetails(detailsJson);

      CommonHelper.logger('INFO', `Invoice Details - Number: ${invoiceNumber}, Date: ${invoiceDate}, Due: ${dueDate}, Agent: ${salesAgent}, Total: ${invoiceTotal}`);

      if (!invoiceNumber || !invoiceDate || !dueDate || !salesAgent || !invoiceTotal) {
        CommonHelper.logger('WARN', `Invoice details missing`);
        if (!this.page.isClosed()) {
          await this.page.screenshot({ path: 'invoice-details-missing.png', fullPage: true });
        }
      }
    } catch (err) {
      CommonHelper.logger('ERROR', 'Error updating Invoice details in JSON:', err);
    }
  }

  /**
   * Applies credit amount to reduce the invoice balance
   * 
   * @async
   * @private
   * @returns {Promise<void>}
   * @throws {Error} If Apply Credits modal or input field not found
   * 
   * @description Workflow:
   * 1. Clicks "Apply Credits" link to open modal
   * 2. Waits for modal to appear and become visible
   * 3. Finds the first visible input field in the modal (retries up to 20 times)
   * 4. Fills input with "100" as the credit amount
   * 5. Clicks "Apply" button to submit
   * 
   * Includes robust input field detection with multiple retry attempts
   * and saves modal HTML for debugging if input is not found.
   * 
   * @example
   * ```typescript
   * await this.applyCredits();
   * // 100 credits applied to invoice
   * ```
   */
  private async applyCredits(): Promise<void> {
    const applyCreditsLink = this.page.locator('a[data-toggle="modal"][data-target="#apply_credits"]', { hasText: 'Apply Credits' });
    await expect(applyCreditsLink).toBeVisible({ timeout: 10000 });
    await applyCreditsLink.click();
    CommonHelper.logger('STEP', 'Clicked Apply Credits link');

    // Wait for Apply Credits modal to appear
    const applyCreditsModal = this.page.locator('#apply_credits');
    await expect(applyCreditsModal).toBeVisible({ timeout: 10000 });

    // Wait for input to appear in modal
    await this.page.waitForTimeout(500);
    let foundInput = false;
    for (let i = 0; i < 20; i++) {
      const inputCount = await applyCreditsModal.locator('input').count();
      if (inputCount > 0) {
        foundInput = true;
        break;
      }
      await this.page.waitForTimeout(500);
    }

    if (!foundInput) {
      const modalHtml = await applyCreditsModal.innerHTML();
      require('fs').writeFileSync('apply-credits-modal-debug.html', modalHtml);
      CommonHelper.logger('ERROR', 'No input found in Apply Credits modal');
      throw new Error('No input found in Apply Credits modal');
    }

    // Find and fill the first visible input
    const inputHandles = await applyCreditsModal.locator('input').elementHandles();
    let amountInput = null;
    
    for (const handle of inputHandles) {
      if (await handle.isVisible()) {
        const name = await handle.getAttribute('name');
        amountInput = this.page.locator(`#apply_credits input[name='${name}']`);
        break;
      }
    }
    
    if (!amountInput) {
      amountInput = applyCreditsModal.locator('input').first();
    }

    await expect(amountInput).toBeVisible({ timeout: 5000 });
    await amountInput.fill('100');
    CommonHelper.logger('STEP', 'Entered 100 in Amount to Credit');

    // Click Apply button
    const applyBtn = applyCreditsModal.locator('button, a', { hasText: 'Apply' });
    await expect(applyBtn).toBeVisible({ timeout: 5000 });
    await applyBtn.click();
    CommonHelper.logger('STEP', 'Clicked Apply in Apply Credits modal');
  }

  /**
   * Records a payment for the invoice with transaction details
   * 
   * @async
   * @private
   * @returns {Promise<void>}
   * @throws {Error} If payment panel not found or required fields missing
   * 
   * @description Payment recording workflow:
   * 1. Clicks "Payment" button to open payment panel
   * 2. Waits for payment panel to appear (uses robust panel detection)
   * 3. Selects a random valid payment mode from dropdown
   * 4. Generates and enters a random 12-digit alphanumeric transaction ID
   * 5. Clicks "Save" button to submit payment
   * 
   * Payment Mode: Randomly selected from available options (excludes "select" placeholder)
   * Transaction ID: 12-character random alphanumeric string (A-Z, 0-9)
   * 
   * @example
   * ```typescript
   * await this.recordPayment();
   * // Payment recorded with random mode and transaction ID
   * ```
   */
  private async recordPayment(): Promise<void> {
    // Click Payment button
    const paymentBtn = this.page.locator('a.btn.btn-primary', { hasText: 'Payment' });
    await expect(paymentBtn).toBeVisible({ timeout: 10000 });
    await paymentBtn.click();
    CommonHelper.logger('STEP', 'Clicked Payment button');

    // Wait for Payment panel to appear (robust)
    const paymentPanel = await this.findPaymentPanel();
    await expect(paymentPanel).toBeVisible({ timeout: 10000 });

    // Select random Payment Mode
    const paymentModeDropdown = paymentPanel.locator('select[name="paymentmode"]');
    await expect(paymentModeDropdown).toBeVisible({ timeout: 10000 });
    const paymentModes = await paymentModeDropdown.locator('option').allTextContents();
    const validModes = paymentModes.filter(opt => opt && opt.trim().length > 0 && !opt.toLowerCase().includes('select'));
    const randomMode = validModes[Math.floor(Math.random() * validModes.length)];
    await paymentModeDropdown.selectOption({ label: randomMode });
    CommonHelper.logger('INFO', `Selected Payment Mode: ${randomMode}`);

    // Enter random 12-digit alphanumeric Transaction ID
    const txnId = this.generateTransactionId();
    const txnInput = paymentPanel.locator('input[name="transactionid"], input[name="transaction_id"], input[placeholder*="Transaction"]');
    await expect(txnInput).toBeVisible({ timeout: 10000 });
    await txnInput.fill(txnId);
    CommonHelper.logger('INFO', `Entered Transaction ID: ${txnId}`);

    // Click Save button
    const savePaymentBtn = paymentPanel.locator('button, a', { hasText: 'Save' });
    await expect(savePaymentBtn).toBeVisible({ timeout: 10000 });
    await savePaymentBtn.click();
    CommonHelper.logger('STEP', 'Clicked Save in Payment panel');
  }

  /**
   * Approve Payment through More dropdown
   */
  private async approvePayment(): Promise<void> {
    try {
      // Click "More" dropdown
      let moreDropdownClicked = false;
      for (let i = 0; i < 5; i++) {
        const moreDropdowns = await this.page.locator('button, a', { hasText: 'More' }).elementHandles();
        for (const handle of moreDropdowns) {
          const text = (await handle.textContent())?.trim() || '';
          if (text === 'More') {
            const box = await handle.boundingBox();
            if (box && box.width > 0 && box.height > 0) {
              await handle.hover();
              await handle.click();
              moreDropdownClicked = true;
              CommonHelper.logger('STEP', 'Clicked More dropdown for Approve Payment');
              break;
            }
          }
        }
        if (moreDropdownClicked) break;
        await this.page.waitForTimeout(1000);
      }

      if (!moreDropdownClicked) {
        CommonHelper.logger('WARN', 'Could not find or click More dropdown');
        throw new Error('More dropdown not found');
      }

      // Wait for Approve Payment button to appear
      const approvePaymentLocator = this.page.locator('a, button', { hasText: 'Approve Payment' });
      try {
        await approvePaymentLocator.first().waitFor({ state: 'visible', timeout: 5000 });
      } catch {
        CommonHelper.logger('WARN', 'Approve Payment button did not become visible');
      }

      // Click "Approve Payment" (only visible buttons)
      let clicked = false;
      for (let attempt = 0; attempt < 5 && !clicked; attempt++) {
        const approvePaymentBtns = this.page.locator('a, button', { hasText: 'Approve Payment' });
        const count = await approvePaymentBtns.count();
        
        for (let i = 0; i < count; i++) {
          const btn = approvePaymentBtns.nth(i);
          const visible = await btn.isVisible();
          const enabled = await btn.isEnabled();
          
          if (visible && enabled) {
            await btn.click();
            clicked = true;
            CommonHelper.logger('STEP', 'Clicked Approve Payment in More dropdown');
            break;
          }
        }

        if (!clicked) {
          CommonHelper.logger('WARN', `Attempt ${attempt + 1}: No visible Approve Payment button, retrying...`);
          await this.page.waitForTimeout(1000);
          
          // Re-click More dropdown
          const moreDropdowns = await this.page.locator('button, a', { hasText: 'More' }).elementHandles();
          for (const handle of moreDropdowns) {
            const text = (await handle.textContent())?.trim() || '';
            if (text === 'More') {
              const box = await handle.boundingBox();
              if (box && box.width > 0 && box.height > 0) {
                await handle.hover();
                await handle.click();
                CommonHelper.logger('STEP', 'Re-clicked More dropdown (retry)');
                break;
              }
            }
          }
        }
      }

      if (!clicked) {
        throw new Error('No visible Approve Payment button found');
      }

      // Wait for confirmation popup and click "Yes, approve it!"
      const yesApproveBtn = this.page.locator('button, a', { hasText: 'Yes, approve it!' });
      await expect(yesApproveBtn).toBeVisible({ timeout: 10000 });
      await yesApproveBtn.click();
      CommonHelper.logger('STEP', 'Clicked Yes, approve it! in confirmation popup');
      await this.page.waitForTimeout(2000);
    } catch (err) {
      CommonHelper.logger('ERROR', 'Error during Approve Payment workflow:', err);
      throw err;
    }

    // Capture payment ID from URL
    const paymentUrl = this.page.url();
    const paymentIdMatch = paymentUrl.match(/(\d+)(?!.*\d)/);
    const paymentId = paymentIdMatch ? paymentIdMatch[1] : '';
    
    if (paymentId) {
      try {
        const detailsJson = readAbisExecutionDetails();
        detailsJson.payment = detailsJson.payment || {};
        detailsJson.payment.paymentId = paymentId;
        writeAbisExecutionDetails(detailsJson);
        CommonHelper.logger('INFO', `Payment ID captured: ${paymentId}`);
      } catch (err) {
        CommonHelper.logger('ERROR', 'Error updating payment ID in JSON:', err);
      }
    } else {
      CommonHelper.logger('WARN', `Payment ID not found in URL: ${paymentUrl}`);
    }
  }

  /**
   * Navigate back to Invoice via "Payment for Invoice" link
   */
  private async navigateBackToInvoice(): Promise<void> {
    const paymentForInvoiceLabel = this.page.locator('text=Payment for Invoice');
    const parent = paymentForInvoiceLabel.locator('..');
    const paymentForInvoiceLink = parent.locator('a');
    
    await expect(paymentForInvoiceLink.first()).toBeVisible({ timeout: 10000 });
    await paymentForInvoiceLink.first().click();
    await this.page.waitForLoadState('networkidle');
    CommonHelper.logger('STEP', 'Navigated back to Invoice via Payment for Invoice link');
  }

  /**
   * Helper: Find Payment panel using multiple strategies
   */
  private async findPaymentPanel() {
    let paymentPanel = null;
    
    for (let i = 0; i < 20; i++) {
      // Try #record_payment_form first
      const panel = this.page.locator('#record_payment_form');
      if (await panel.count() && await panel.isVisible()) {
        return panel;
      }

      // Try heading
      const heading = this.page.getByRole('heading', { name: /Record Payment/i });
      if (await heading.count() && await heading.isVisible()) {
        // Look for panels containing the heading
        const panels = this.page.locator('.panel_s, .panel-body').filter({ has: heading });
        const panelCount = await panels.count();
        
        if (panelCount === 1 && await panels.first().isVisible()) {
          return panels.first();
        } else if (panelCount > 1) {
          for (let idx = 0; idx < panelCount; idx++) {
            const candidate = panels.nth(idx);
            if (await candidate.isVisible()) {
              return candidate;
            }
          }
        }
      }
      
      await this.page.waitForTimeout(500);
    }

    // Diagnostics if not found
    const pageHtml = await this.page.content();
    require('fs').writeFileSync('payment-panel-debug.html', pageHtml);
    CommonHelper.logger('ERROR', 'No visible payment panel found');
    throw new Error('No visible Payment panel found');
  }

  /**
   * Helper: Generate random 12-digit alphanumeric transaction ID
   */
  private generateTransactionId(len = 12): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let out = '';
    for (let i = 0; i < len; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }
}
