import { Page, expect } from '@playwright/test';
import { CommonHelper } from '../commonHelper';
import { readAbisExecutionDetails, writeAbisExecutionDetails } from './jsonWriteHelper';

/**
 * ProformaHelper - Handles Proforma creation and management
 * 
 * Main Workflow:
 * 1. Navigate to customer's Proforma tab
 * 2. Click "Create New Proforma"
 * 3. Select billing company
 * 4. Add services from modal
 * 5. Fill and save Proforma
 * 6. Mark as Accepted
 * 7. Capture Proforma details (number, date, expiry, total)
 */
export class ProformaHelper {
  constructor(private page: Page) {}

  /**
   * Main method: Create Proforma and mark as accepted
   * @param clientId - Customer/client ID
   * @param appBaseUrl - Base URL of the application
   */
  async createAndAcceptProforma(clientId: string, appBaseUrl: string): Promise<void> {
    await this.navigateToProformaTab(clientId, appBaseUrl);
    await this.clickCreateNewProforma();
    await this.selectBillingCompany();
    await this.addServicesFromModal();
    await this.makeFieldsEditable();
    await this.clickTickMark();
    await this.saveProforma();
    await this.markAsAccepted();
    await this.captureProformaDetails();
  }

  /**
   * Navigate to customer page and click Proforma tab
   */
  private async navigateToProformaTab(clientId: string, appBaseUrl: string): Promise<void> {
    try {
      await this.page.goto(`${appBaseUrl}/clients/client/${clientId}`);
      CommonHelper.logger('STEP', 'Navigated to client page');

      const proformaTab = this.page.getByRole('link', { name: 'Proforma', exact: true });
      await expect(proformaTab).toBeVisible({ timeout: 10000 });
      await proformaTab.click();
      CommonHelper.logger('STEP', 'Clicked Proforma tab in customer page');
    } catch (err) {
      CommonHelper.logger('ERROR', 'Error navigating to client page or clicking Proforma:', err);
      throw err;
    }
  }

  /**
   * Click "Create New Proforma" button and wait for navigation
   */
  private async clickCreateNewProforma(): Promise<void> {
    const createProformaLink = this.page.locator('a.btn.btn-primary.mbot15', { hasText: 'Create New Proforma' });
    await expect(createProformaLink).toBeVisible({ timeout: 10000 });
    await Promise.all([
      this.page.waitForNavigation({ timeout: 10000 }),
      createProformaLink.click()
    ]);
    CommonHelper.logger('STEP', 'Clicked Create New Proforma and navigated to Proforma creation page');

    // Wait extra for page load
    await this.page.waitForTimeout(3000);
  }

  /**
   * Select billing company from dropdown
   */
  private async selectBillingCompany(): Promise<void> {
    const detailsJson = readAbisExecutionDetails();
    const billingCompany = detailsJson.proposal?.services?.[0]?.company || detailsJson.company?.company || '';
    
    const billingFromDropdown = this.page.locator('select[name="c_id"], #mastercompany');
    if (await billingFromDropdown.isVisible({ timeout: 10000 })) {
      await billingFromDropdown.selectOption({ label: billingCompany });
      CommonHelper.logger('STEP', `Selected Billing From company: ${billingCompany}`);
    } else {
      CommonHelper.logger('WARN', 'Billing From dropdown not found or not visible. Skipping dropdown step.');
    }
  }

  /**
   * Click "View Services" and add service from modal
   */
  private async addServicesFromModal(): Promise<void> {
    const viewServicesBtn = this.page.getByRole('button', { name: /View Services/i });
    if (!(await viewServicesBtn.isVisible({ timeout: 5000 }))) {
      return; // Services modal not needed
    }

    await viewServicesBtn.click();
    CommonHelper.logger('STEP', 'Clicked View Services');

    // Wait for services modal to appear
    const servicesModal = this.page.locator('.modal:visible').filter({ hasText: 'Services' });
    await expect(servicesModal).toBeVisible({ timeout: 10000 });
    
    const addServiceBtn = servicesModal.locator('a.btn.addtoestimate');
    try {
      await expect(addServiceBtn).toBeVisible({ timeout: 10000 });
      await addServiceBtn.click();
      CommonHelper.logger('STEP', 'Clicked Add in services modal');
    } catch (err) {
      // Diagnostics
      const allLinks = await servicesModal.locator('a').allTextContents();
      CommonHelper.logger('ERROR', `Add link not found/visible in Services modal. All visible links: ${JSON.stringify(allLinks)}`);
      throw err;
    }
  }

  /**
   * Make readonly fields editable using JavaScript
   */
  private async makeFieldsEditable(): Promise<void> {
    await this.page.evaluate(() => {
      const modals = Array.from(document.querySelectorAll('.modal, .modal.show'));
      // Remove readonly attributes from items table fields
      document.querySelectorAll('.panel_s.accounting-template input[readonly], .panel_s.accounting-template textarea[readonly]').forEach(el => {
        el.removeAttribute('readonly');
      });
    });
  }

  /**
   * Click the blue tick mark button to confirm item
   */
  private async clickTickMark(): Promise<void> {
    const itemsSection = this.page.locator('.panel_s.accounting-template');
    const tickBtn = itemsSection.locator('button.btn-primary:has(i.fa-check)');
    
    try {
      await expect(tickBtn).toBeVisible({ timeout: 10000 });
      await tickBtn.click();
      CommonHelper.logger('STEP', 'Clicked blue tick mark button in Proforma page');
    } catch (err) {
      // Diagnostics
      const allButtons = await this.page.locator('button').allTextContents();
      const allLinks = await this.page.locator('a').allTextContents();
      CommonHelper.logger('ERROR', `Tick mark button not found. Buttons: ${JSON.stringify(allButtons)}, Links: ${JSON.stringify(allLinks)}`);
      throw err;
    }
  }

  /**
   * Click Save button and wait for success
   */
  private async saveProforma(): Promise<void> {
    const saveBtnAfterTick = this.page.getByRole('button', { name: /Save/i });
    await expect(saveBtnAfterTick).toBeEnabled({ timeout: 10000 });
    await saveBtnAfterTick.click();
    CommonHelper.logger('STEP', 'Clicked Save in Proforma page');

    // Wait for success indicator
    let saveSuccess = false;
    try {
      await Promise.race([
        this.page.waitForSelector('.toast-success, .alert-success, .notification-success', { timeout: 10000 }),
        this.page.waitForNavigation({ timeout: 10000 }),
        this.page.waitForSelector('text=Proforma created successfully', { timeout: 10000 })
      ]);
      saveSuccess = true;
      CommonHelper.logger('INFO', 'Proforma Save success confirmed');
    } catch (err) {
      CommonHelper.logger('WARN', 'No success indicator found after Save');
      await this.page.screenshot({ path: 'proforma-save-failed.png', fullPage: true });
      throw new Error('Proforma Save did not trigger success indicator');
    }

    // Wait for page to stabilize
    await this.page.waitForTimeout(2000);
  }

  /**
   * Click More dropdown and select "Mark as Accepted"
   */
  private async markAsAccepted(): Promise<void> {
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
              CommonHelper.logger('STEP', 'Clicked More dropdown in Proforma page');
              break;
            }
          }
        }
        if (moreDropdownClicked) break;
        await this.page.waitForTimeout(1000);
      } catch (err) {
        if (String(err).includes('Execution context was destroyed')) {
          CommonHelper.logger('WARN', 'Execution context destroyed, retrying More dropdown...');
          await this.page.waitForLoadState('networkidle');
          await this.page.waitForTimeout(1500);
          continue;
        } else {
          throw err;
        }
      }
    }

    if (!moreDropdownClicked) {
      CommonHelper.logger('WARN', 'Could not find or click More dropdown for Mark as Accepted');
      throw new Error('More dropdown not found or not clickable');
    }

    // Click "Mark as Accepted"
    const markAsAcceptedBtn = this.page.locator('a, button', { hasText: 'Mark as Accepted' });
    await expect(markAsAcceptedBtn).toBeVisible({ timeout: 10000 });
    await markAsAcceptedBtn.click();
    CommonHelper.logger('STEP', 'Clicked Mark as Accepted in Proforma page');
    
    await this.page.waitForTimeout(2000);
  }

  /**
   * Capture and save Proforma details (number, date, expiry, total)
   */
  private async captureProformaDetails(): Promise<void> {
    const pageContent = await this.page.content();

    // Extract Proforma Number (EST-xxx)
    let proformaNumber = '';
    const proformaMatch = pageContent.match(/EST-\d+/);
    if (proformaMatch) proformaNumber = proformaMatch[0];

    // Extract Proforma Date
    let proformaDate = '';
    try {
      const dateInput = this.page.locator('input[name="date"], input#date');
      if (await dateInput.count() && await dateInput.isVisible()) {
        proformaDate = await dateInput.inputValue();
      }
      
      if (!proformaDate) {
        // Try to find date in page content using regex
        const dateMatch = pageContent.match(/Date[:\s]*(\d{2}-\d{2}-\d{4})/i);
        if (dateMatch) proformaDate = dateMatch[1];
      }
    } catch (err) {
      CommonHelper.logger('WARN', 'Could not find Proforma date:', err);
    }

    // Extract Expiry Date
    let expiryDate = '';
    try {
      const expiryInput = this.page.locator('input[name="expiry_date"], input#expiry_date');
      if (await expiryInput.count() && await expiryInput.isVisible()) {
        expiryDate = await expiryInput.inputValue();
      }
      
      if (!expiryDate) {
        const expiryLabelLocator = this.page.locator('text=Expiry Date');
        if (await expiryLabelLocator.count()) {
          const expiryValueLocator = expiryLabelLocator.locator('xpath=following-sibling::*[1]');
          if (await expiryValueLocator.count()) {
            const expiryValueText = await expiryValueLocator.textContent();
            const dateMatch = expiryValueText && expiryValueText.match(/(\d{2}-\d{2}-\d{4})/);
            if (dateMatch) expiryDate = dateMatch[1];
          }
          
          if (!expiryDate) {
            const expiryRow = expiryLabelLocator.locator('xpath=ancestor::tr[1]');
            if (await expiryRow.count()) {
              const expiryRowText = await expiryRow.textContent();
              const dateMatch = expiryRowText && expiryRowText.match(/(\d{2}-\d{2}-\d{4})/);
              if (dateMatch) expiryDate = dateMatch[1];
            }
          }
        }
      }
      
      if (!expiryDate) {
        const expiryLabelIndex = pageContent.indexOf('Expiry');
        const dateRegex = /(\d{2}-\d{2}-\d{4})/g;
        let match;
        let closestDate = '';
        let closestDistance = Infinity;
        while ((match = dateRegex.exec(pageContent)) !== null) {
          const idx = match.index;
          const dist = Math.abs(idx - expiryLabelIndex);
          if (dist < closestDistance) {
            closestDistance = dist;
            closestDate = match[1];
          }
        }
        if (closestDate) expiryDate = closestDate;
      }
    } catch (err) {
      CommonHelper.logger('WARN', 'Could not find Expiry date:', err);
    }

    // Extract Total
    let total = '';
    try {
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
        const match = pageContent.match(totalLabelRegex);
        if (match) bestTotal = match[1];
      }
      total = bestTotal;
    } catch (err) {
      CommonHelper.logger('WARN', 'Could not find Proforma total:', err);
    }

    // Write to JSON file
    try {
      const detailsJson = readAbisExecutionDetails();
      detailsJson.proforma = detailsJson.proforma || {};
      detailsJson.proforma.proformaNumber = proformaNumber;
      detailsJson.proforma.proformaDate = proformaDate;
      detailsJson.proforma.expiryDate = expiryDate;
      detailsJson.proforma.total = total;
      writeAbisExecutionDetails(detailsJson);

      CommonHelper.logger('INFO', `Proforma Details - Number: ${proformaNumber}, Date: ${proformaDate}, Expiry: ${expiryDate}, Total: ${total}`);

      if (!proformaDate || !expiryDate || !total) {
        CommonHelper.logger('WARN', `Proforma details missing: date='${proformaDate}', expiry='${expiryDate}', total='${total}'`);
        await this.page.screenshot({ path: 'proforma-details-missing.png', fullPage: true });
      }
    } catch (err) {
      CommonHelper.logger('ERROR', 'Error updating Proforma details in JSON:', err);
    }
  }
}
