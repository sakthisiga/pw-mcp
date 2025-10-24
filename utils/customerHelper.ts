import { Page, expect } from '@playwright/test';
import { CommonHelper } from './commonHelper';

/**
 * CustomerHelper - Handles customer conversion and admin assignment
 * 
 * This helper encapsulates all customer-related operations including:
 * - Converting leads to customers with PAN/GST details
 * - Assigning customer administrators
 * - Capturing client IDs
 */
export class CustomerHelper {
  constructor(
    private page: Page,
    private APP_BASE_URL: string
  ) {}

  /**
   * Main method: Convert lead to customer and assign admin
   * @param leadName - Name of the lead to convert
   * @param leadModal - Lead modal locator
   * @returns Object containing clientId and customerAdmin
   */
  async convertToCustomerAndAssignAdmin(
    leadName: string,
    leadModal: any
  ): Promise<{ clientId: string; customerAdmin: string }> {
    // Step 1: Convert lead to customer
    const clientId = await this.convertLeadToCustomer(leadName, leadModal);

    // Step 2: Navigate to Profile tab
    await this.navigateToProfileTab();

    // Step 3: Assign customer admin
    const customerAdmin = await this.assignCustomerAdmin();

    return { clientId, customerAdmin };
  }

  /**
   * Convert a lead to customer by filling PAN/GST and saving
   */
  private async convertLeadToCustomer(leadName: string, leadModal: any): Promise<string> {
    // Click the "Convert to customer" link
    const convertLink = leadModal.locator('a:has-text("Convert to customer")');
    await expect(convertLink).toBeVisible({ timeout: 10000 });
    await convertLink.click();
    CommonHelper.logger('STEP', `--- Clicked Convert to customer for lead: ${leadName} ---`);

    // Wait for the page to fully load
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(1000);

    // Fill PAN and GST fields
    await this.fillPANandGST();

    // Click Save button
    const saveCustomerBtn = this.page.locator('#custformsubmit');
    await expect(saveCustomerBtn).toBeVisible({ timeout: 15000 });
    await expect(saveCustomerBtn).toBeEnabled();
    await saveCustomerBtn.click();
    CommonHelper.logger('STEP', '--- Clicked Save after Convert to customer ---');

    // Wait for conversion to complete
    await expect(this.page.locator('a[data-group="profile"]')).toBeVisible({ timeout: 15000 });

    // Capture and return Client ID
    const clientId = await this.captureClientId();
    return clientId;
  }

  /**
   * Fill PAN and GST fields in the convert modal
   */
  private async fillPANandGST(): Promise<void> {
    const convertModal = this.page.locator('.modal:visible');
    await expect(convertModal).toBeVisible({ timeout: 10000 });

    // Try multiple selector strategies for PAN and GST fields
    let panInput = convertModal.locator("input[name='pan_num']");
    if (!(await panInput.count())) panInput = convertModal.locator("#pan_num");
    if (!(await panInput.count())) panInput = this.page.locator("input[name='pan_num']");
    if (!(await panInput.count())) panInput = this.page.locator("#pan_num");

    let gstInput = convertModal.locator("input[name='vat']");
    if (!(await gstInput.count())) gstInput = convertModal.locator("input[name='gst']");
    if (!(await gstInput.count())) gstInput = this.page.locator("input[name='vat']");
    if (!(await gstInput.count())) gstInput = this.page.locator("input[name='gst']");

    // Generate realistic PAN and GST numbers
    const panValue = this.generatePAN();
    const gstValue = this.generateGST(panValue);

    // Fill PAN and GST fields with retries
    let panFilled = false, gstFilled = false;
    for (let i = 0; i < 3; i++) {
      if (!panFilled && panInput && await panInput.count()) {
        await panInput.first().fill(panValue);
        panFilled = true;
        CommonHelper.logger('INFO', `Entered PAN Number: ${panValue}`);
      }
      if (!gstFilled && gstInput && await gstInput.count()) {
        await gstInput.first().fill(gstValue);
        gstFilled = true;
        CommonHelper.logger('INFO', `Entered GST Number: ${gstValue}`);
      }
      if (panFilled && gstFilled) break;
      await this.page.waitForTimeout(1000);
    }

    if (!panFilled) {
      console.warn('PAN Number field not found');
    }
    if (!gstFilled) {
      console.warn('GST Number field not found');
    }
  }

  /**
   * Generate a realistic PAN number
   * Format: 5 letters + 4 digits + 1 letter (e.g., ABCDE1234F)
   */
  private generatePAN(): string {
    const letters = () => Array.from({ length: 5 }, () => 
      String.fromCharCode(65 + Math.floor(Math.random() * 26))
    ).join('');
    const digits = () => String(Math.floor(1000 + Math.random() * 9000));
    const lastLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    return `${letters()}${digits()}${lastLetter}`;
  }

  /**
   * Generate a realistic GST number based on PAN
   * Format: 2-digit state code + 10-char PAN + entity code + Z + checksum
   * Example: 27ABCDE1234F1Z5
   */
  private generateGST(pan: string): string {
    const stateCode = String(Math.floor(1 + Math.random() * 35)).padStart(2, '0');
    let panPart = pan;
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
      panPart = 'ABCDE1234F';
    }
    const entityCode = '1';
    const defaultZ = 'Z';
    const checksum = Math.random() < 0.5 
      ? String.fromCharCode(65 + Math.floor(Math.random() * 26)) 
      : String(Math.floor(Math.random() * 10));
    return `${stateCode}${panPart}${entityCode}${defaultZ}${checksum}`;
  }

  /**
   * Capture Client ID from page content after conversion
   * Client ID format: #901, #902, etc.
   */
  private async captureClientId(): Promise<string> {
    await this.page.waitForTimeout(1000);
    const pageText = await this.page.evaluate(() => document.body.innerText);
    const clientIdMatch = pageText.match(/^\s*#\d+/m);
    
    if (clientIdMatch) {
      const clientId = clientIdMatch[0].trim();
      CommonHelper.logger('INFO', `Captured Client ID: ${clientId}`);
      return clientId;
    } else {
      CommonHelper.logger('WARN', 'Client ID not found at beginning of page.');
      return '';
    }
  }

  /**
   * Navigate to the Profile tab after customer conversion
   */
  private async navigateToProfileTab(): Promise<void> {
    const profileTab = this.page.locator('a[data-group="profile"]');
    await expect(profileTab).toBeVisible({ timeout: 10000 });
    await profileTab.click();
    CommonHelper.logger('STEP', '--- Profile tab clicked ---');
  }

  /**
   * Assign a customer admin
   * @returns The name of the assigned admin
   */
  private async assignCustomerAdmin(): Promise<string> {
    // Click Customer Admins tab
    const adminsTab = this.page.locator('button, a', { hasText: 'Customer Admins' });
    await expect(adminsTab).toBeVisible({ timeout: 10000 });
    await adminsTab.click();
    CommonHelper.logger('STEP', '--- Customer Admins tab clicked ---');

    // Wait for the tab panel to be visible
    const adminsPanel = this.page.locator('div[role="tabpanel"]:has-text("Assign Admin")');
    await adminsPanel.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

    // Retry logic for Assign Admin button
    let assignAdminBtn = this.page.locator('button, a', { hasText: 'Assign Admin' });
    for (let i = 0; i < 3; i++) {
      if (await assignAdminBtn.isVisible()) break;
      await adminsTab.click();
      await this.page.waitForTimeout(2000);
      assignAdminBtn = this.page.locator('button, a', { hasText: 'Assign Admin' });
    }
    await expect(assignAdminBtn).toBeVisible({ timeout: 15000 });
    await assignAdminBtn.click();
    CommonHelper.logger('STEP', '--- Assign Admin button clicked ---');

    // Wait for modal to appear
    const adminsModal = this.page.locator('#customer_admins_assign');
    await expect(adminsModal).toBeVisible({ timeout: 20000 });
    if (!(await adminsModal.isVisible())) {
      await this.page.screenshot({ path: 'customer-admins-modal-debug.png', fullPage: true });
      throw new Error('Customer Admins modal not found. Screenshot saved for debugging.');
    }

    // Select a random admin from dropdown
    const selectedAdmin = await this.selectRandomAdmin(adminsModal);

    // Click Save in modal
    const saveAdminBtn = adminsModal.locator('button, a', { hasText: 'Save' });
    await expect(saveAdminBtn).toBeVisible({ timeout: 10000 });
    await saveAdminBtn.click();
    CommonHelper.logger('STEP', '--- Customer Admin modal Save clicked ---');

    // Wait for modal to close
    await expect(adminsModal).not.toBeVisible({ timeout: 15000 });

    return selectedAdmin;
  }

  /**
   * Select a random admin from the dropdown in the modal
   */
  private async selectRandomAdmin(adminsModal: any): Promise<string> {
    const dropdown = adminsModal.locator('select');
    await expect(dropdown).toBeVisible({ timeout: 10000 });
    
    const options = await dropdown.locator('option').allTextContents();
    const indices = options.map((_: string, i: number) => i).filter((i: number) => i > 0);
    const randomIndex = indices[Math.floor(Math.random() * indices.length)];
    
    await dropdown.selectOption({ index: randomIndex });
    
    let selectedOption = '';
    if (await adminsModal.isVisible() && await dropdown.isVisible()) {
      selectedOption = (await dropdown.locator('option:checked').textContent()) || '';
      CommonHelper.logger('INFO', `Randomly selected Customer Admin: ${selectedOption}`);
    } else {
      CommonHelper.logger('WARN', 'Dropdown or modal not visible after selecting option, skipping reading selected option.');
    }
    
    return selectedOption;
  }
}
