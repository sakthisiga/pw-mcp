import { Page, expect } from '@playwright/test';
import { CommonHelper } from '../commonHelper';

// Keep faker usage consistent with the spec
// eslint-disable-next-line @typescript-eslint/no-var-requires
const faker = require('faker');

export interface LeadDetails {
  leadId: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  city: string;
  state: string | null;
  zip: string;
}

export class LeadHelper {
  private page: Page;
  private baseUrl: string;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  // Creates a lead and waits for the lead modal (#lead-modal) to be visible
  // Returns the generated lead details used later in the test flow
  async createLead(): Promise<LeadDetails> {
    const { page, baseUrl } = this;

    CommonHelper.logger('STEP', 'Navigating to leads page');
    await page.goto(`${baseUrl}/leads`);

    CommonHelper.logger('STEP', 'Looking for New Lead link');
    const newLeadLink = page.locator('a', { hasText: 'New Lead' });
    await CommonHelper.resilientExpectVisible(newLeadLink, page, 'new-lead-link');
    CommonHelper.logger('STEP', 'New Lead link visible');
    await CommonHelper.resilientClick(newLeadLink, page, 'new-lead-link');
    CommonHelper.logger('STEP', 'Clicked New Lead link');

    // Ensure form is loaded
    CommonHelper.logger('STEP', 'Waiting for lead form heading');
    await CommonHelper.resilientExpectVisible(page.getByRole('heading', { name: /Add new lead/i }), page, 'lead-form-heading');
    CommonHelper.logger('STEP', 'Lead form heading visible');

    // Generate details
    const name = faker.name.findName();
    const email = faker.internet.email();
    const phone = faker.phone.phoneNumber('999#######');
    const company = faker.company.companyName();
    const address = faker.address.streetAddress();
    const city = faker.address.city();
    const zip = String(Math.floor(100000 + Math.random() * 900000));

    const form = page.locator('#lead_form');

    // Fill core fields
    await CommonHelper.resilientFill(form.locator('input#name'), name, page, 'lead-name');
    await CommonHelper.resilientFill(form.locator('input#email'), email, page, 'lead-email');
    await CommonHelper.resilientFill(form.locator('input#phonenumber'), phone, page, 'lead-phone');

    // Additional fields
    await CommonHelper.resilientFill(form.locator('input#company'), company, page, 'lead-company');
    CommonHelper.logger('INFO', 'Lead Company:', company);

    await form.locator('input#address').fill(address);
    await expect(form.locator('input#address')).toHaveValue(address);
    CommonHelper.logger('INFO', 'Lead Address:', address);

    await form.locator('input#city').fill(city);
    await expect(form.locator('input#city')).toHaveValue(city);
    CommonHelper.logger('INFO', 'Lead City:', city);

    // State
    const stateDropdown = form.locator('select#state');
    await expect(stateDropdown).toBeVisible();
    await stateDropdown.selectOption({ label: 'Tamil Nadu' });
    const selectedState = await stateDropdown.locator('option:checked').textContent();
    CommonHelper.logger('INFO', 'Lead State:', selectedState);

    // Robust Zip
    let zipInput = form.locator('input#zipcode');
    if (!(await zipInput.count())) zipInput = form.locator("input[name='zipcode']");
    if (!(await zipInput.count())) zipInput = form.locator("input[name*='zip']");
    if (!(await zipInput.count())) zipInput = form.locator("input[name*='postal']");
    if (!(await zipInput.count())) zipInput = form.locator("input[name*='pincode']");

    if (await zipInput.count()) {
      await zipInput.fill(zip);
      await page.waitForTimeout(500);
      const zipValue = await zipInput.inputValue();
      if (zipValue === zip) {
        CommonHelper.logger('INFO', 'Lead Zip code:', zip);
      } else {
        CommonHelper.logger('WARN', `Zip code field did not update as expected. Expected: ${zip}, Actual: ${zipValue}`);
      }
    } else {
      CommonHelper.logger('WARN', 'Zip code field not found, skipping zip code entry.');
    }

    // Save lead
    const saveButton = form.locator('button:has-text("Save")');
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    CommonHelper.logger('STEP', 'Lead saved, waiting for modal...');

    // Wait for the lead modal to appear
    const dialog = page.locator('#lead-modal');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(3000);

    // Extract lead ID from the modal
    let leadId = '';
    try {
      // Method 1: Look for lead ID in the URL of "View Lead" link or similar
      const viewLeadLink = dialog.locator('a[href*="/leads/"], a[href*="leadid="]').first();
      if (await viewLeadLink.count() > 0) {
        const href = await viewLeadLink.getAttribute('href');
        if (href) {
          // Extract lead ID from URL patterns like /leads/123 or ?leadid=123
          const urlMatch = href.match(/\/leads\/(\d+)|leadid=(\d+)/);
          if (urlMatch) {
            leadId = urlMatch[1] || urlMatch[2];
            CommonHelper.logger('INFO', 'Captured Lead ID from link:', leadId);
          }
        }
      }

      // Method 2: Look for lead ID in modal content (e.g., "Lead #123" or "ID: 123")
      if (!leadId) {
        const modalContent = await dialog.textContent();
        const contentMatch = modalContent?.match(/#(\d+)|Lead\s+ID[:\s]*(\d+)|ID[:\s]*(\d+)/i);
        if (contentMatch) {
          leadId = contentMatch[1] || contentMatch[2] || contentMatch[3];
          CommonHelper.logger('INFO', 'Captured Lead ID from modal content:', leadId);
        }
      }

      // Method 3: Look for data-id or similar attributes
      if (!leadId) {
        const leadIdAttr = await dialog.getAttribute('data-leadid') || 
                          await dialog.getAttribute('data-id') ||
                          await dialog.locator('[data-leadid], [data-id]').first().getAttribute('data-leadid') ||
                          await dialog.locator('[data-leadid], [data-id]').first().getAttribute('data-id');
        if (leadIdAttr) {
          leadId = leadIdAttr;
          CommonHelper.logger('INFO', 'Captured Lead ID from data attribute:', leadId);
        }
      }

      if (!leadId) {
        CommonHelper.logger('WARN', 'Could not extract Lead ID from modal');
        leadId = 'N/A';
      }
    } catch (err) {
      CommonHelper.logger('ERROR', 'Error extracting Lead ID:', err);
      leadId = 'N/A';
    }

    return {
      leadId,
      name,
      email,
      phone,
      company,
      address,
      city,
      state: selectedState,
      zip,
    };
  }
}
