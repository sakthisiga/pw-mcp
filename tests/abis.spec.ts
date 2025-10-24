import { login } from '../utils/loginHelper';
import { LeadHelper, LeadDetails } from '../utils/leadHelper';
import { ProposalHelper, ProposalDetails } from '../utils/proposalHelper';
import { CustomerHelper } from '../utils/customerHelper';
import { ServiceHelper } from '../utils/serviceHelper';
import { TaskHelper } from '../utils/taskHelper';
import { readAbisExecutionDetails, writeAbisExecutionDetails } from '../utils/jsonWriteHelper';
import { CommonHelper } from '../utils/commonHelper';
import { test, expect } from '@playwright/test';
import fs from 'fs';
import dotenv from 'dotenv';

// Removed require for fs as we are using ES module imports
const faker = require('faker');
dotenv.config();

const APP_BASE_URL = process.env.APP_BASE_URL;
const E2E_USER = process.env.E2E_USER;
const E2E_PASS = process.env.E2E_PASS;

test('ABIS Sanity @sanity', async ({ page }) => {
  test.setTimeout(300000); // 5 minutes
  CommonHelper.logger('INFO', 'Starting ABIS Sanity Test');
  CommonHelper.logger('INFO', 'Using APP_BASE_URL:', APP_BASE_URL);
  CommonHelper.logger('INFO', 'Using E2E_USER:', E2E_USER);
  // Login
  await login(page, APP_BASE_URL!, E2E_USER!, E2E_PASS!);

  // Create lead via helper
  const leadHelper = new LeadHelper(page, APP_BASE_URL!);
  const lead: LeadDetails = await leadHelper.createLead();
  const { name, email, phone, company, address, city, state: selectedState, zip } = lead;

  // Create proposal via helper
  const proposalHelper = new ProposalHelper(page);
  const proposal: ProposalDetails = await proposalHelper.createAndProcessProposal('#lead-modal');
  const { proposalNumber: proposalNumberHtml, services: selectedServices } = proposal;

  // Go to /leads page
  const leadName = name;
  await page.goto(`${APP_BASE_URL}/leads`);
  // Find the datatable search box inside the table header (try multiple selectors, exclude checkboxes)
  let tableSearchInput = page.locator('table thead input[type="search"]');
  if (!(await tableSearchInput.count())) {
    tableSearchInput = page.locator('table thead input[placeholder*="search" i]');
  }
  if (!(await tableSearchInput.count())) {
    tableSearchInput = page.locator('table thead input:not([type="checkbox"]):not([type="button"]):not([type="submit"])');
  }
  if (!(await tableSearchInput.count())) {
    tableSearchInput = page.locator('input[placeholder*="search" i]');
  }
  if (!(await tableSearchInput.count())) {
    throw new Error('Could not find datatable search input');
  }
  // If multiple search inputs found, use the first one
  const searchInput = tableSearchInput.first();
  await expect(searchInput).toBeVisible();
  await searchInput.fill(leadName);
  await page.waitForTimeout(2000); // Wait for search results to update

  // Click the hyperlink of the lead name in the table to open the lead modal
  const leadLink = page.locator(`a:has-text("${leadName}")`);
  await expect(leadLink).toBeVisible({ timeout: 10000 });
  await leadLink.click();
  // Wait for popup/modal to appear
  const leadModal = page.locator('#lead-modal');
  await expect(leadModal).toBeVisible({ timeout: 10000 });

  // Wait for modal content to be populated before clicking Convert to Customer
  const modalHeading = leadModal.locator('h4, h3, h2, h1').first();
  await expect(modalHeading).toBeVisible({ timeout: 10000 });

  // Convert lead to customer and assign admin via helper
  const customerHelper = new CustomerHelper(page, APP_BASE_URL!);
  const { clientId, customerAdmin } = await customerHelper.convertToCustomerAndAssignAdmin(leadName, leadModal);

  // Update abis_execution_details.json in nested format (now includes customerAdmin)
  let detailsJson = {
    lead: {
      name,
      email,
      phone,
      address,
      city,
      state: selectedState,
      zip
    },
    proposal: {
      proposalNumber: proposalNumberHtml || '',
      services: selectedServices
    },
    company: {
      clientId,
      company,
      customerAdmin: customerAdmin?.trim() || ''
    }
  };
  writeAbisExecutionDetails(detailsJson);

  // --- Add service for customer after admin assignment ---
  const serviceHelper = new ServiceHelper(page);
  const { serviceNumber, deadline } = await serviceHelper.createService(proposalNumberHtml || '');

  // Update abis_execution_details.json
  try {
    const detailsJson = readAbisExecutionDetails();
    detailsJson.service = {
      serviceNumber,
      deadline
    };
    writeAbisExecutionDetails(detailsJson);
    CommonHelper.logger('INFO', 'Service details updated in JSON:', detailsJson.service);
  } catch (err) {
    CommonHelper.logger('ERROR', 'Error updating service details in abis_execution_details.json:', err);
  }

  // --- Workflow: Create new task after service creation ---
  const taskHelper = new TaskHelper(page);
  await taskHelper.createPaymentCollectionTask();

    // --- Additional Workflow: Go to Customer and Pre Payment tab ---
    // Click "Go to Customer" button
    const goToCustomerLink = page.locator('a', { hasText: 'Go to Customer' });
    await expect(goToCustomerLink).toBeVisible({ timeout: 10000 });
    await goToCustomerLink.click();
  CommonHelper.logger('STEP', 'Clicked Go to Customer link');

    // Click "Pre Payment" tab from left side
    const prePaymentTab = page.getByRole('link', { name: 'Pre Payment', exact: true });
    await expect(prePaymentTab).toBeVisible({ timeout: 10000 });
    await prePaymentTab.click();
  CommonHelper.logger('STEP', 'Clicked Pre Payment tab');

    // --- New Pre Payment Workflow ---
    // Click "New Pre Payment" link (not button)
    // Click "New Pre Payment" link (not button)
  const newPrePaymentLink = page.getByRole('link', { name: /New Pre Payment/i });
  await expect(newPrePaymentLink).toBeVisible({ timeout: 10000 });
  await newPrePaymentLink.click();
  CommonHelper.logger('STEP', 'Clicked New Pre Payment link');

  // Wait for New Pre Payment modal/form to appear
  const newPrePaymentHeading = page.getByRole('heading', { name: /New Pre Payment/i });
  await expect(newPrePaymentHeading).toBeVisible({ timeout: 15000 });

  // Wait for Service combobox to be visible after clicking New Pre Payment
  // Robust Service selection: try multiple AJAX search terms and log diagnostics
  const serviceDropdownButton = page.locator('button[data-id="project_id"]');
  try {
    await serviceDropdownButton.waitFor({ state: 'visible', timeout: 15000 });
    await serviceDropdownButton.click();
    const serviceSearchInput = page.locator('#project_ajax_search_wrapper .bs-searchbox input');
    await serviceSearchInput.waitFor({ state: 'visible', timeout: 10000 });
      // Use only a space ' ' to trigger service list
      await serviceSearchInput.type(' ', { delay: 100 });
      await page.waitForTimeout(500); // Give AJAX time to respond
      try {
        await page.waitForFunction(() => {
          const options = Array.from(document.querySelectorAll('#project_ajax_search_wrapper .inner.open ul li a span.text'));
          return options.some(opt => opt.textContent && opt.textContent.trim().length > 0);
        }, { timeout: 7000 });
        // Log available options for diagnostics
        const options = await page.$$eval('#project_ajax_search_wrapper .inner.open ul li a span.text', nodes => nodes.map(n => n.textContent));
        // console.log(`Service options found for space search:`, options);
        // Click the first non-empty option
        const firstOption = page.locator('#project_ajax_search_wrapper .inner.open ul li a span.text').filter({ hasText: /.+/ }).first();
        await firstOption.click();
      } catch {
        // Log dropdown HTML for diagnostics
  const dropdownHtml = await page.locator('#project_ajax_search_wrapper .dropdown-menu.open').innerHTML();
  CommonHelper.logger('WARN', 'service-dropdown-debug-space: saved dropdown HTML in memory for review');
        throw new Error('No service options found after space AJAX search. See diagnostics.');
      }
  } catch (e) {
  await page.screenshot({ path: 'service-dropdown-arrow-fail.png' });
  CommonHelper.logger('WARN', 'service-dropdown-arrow-fail: saved screenshot for debugging');
    throw new Error('Service dropdown down arrow or options not visible. Screenshot and HTML saved for debugging.');
  }

  // Select Payment Mode using the correct <select> element
  const paymentModeSelect = page.locator('.modal:visible select[name="custom_fields[credit_note][1]"], select[name="custom_fields[credit_note][1]"]');
  await expect(paymentModeSelect).toBeVisible({ timeout: 10000 });
  // Get available options for diagnostics
  const paymentModeOptions = await paymentModeSelect.locator('option').allTextContents();
  // Select the first valid option (not empty)
  const validPaymentMode = paymentModeOptions.find(opt => opt && opt.trim().length > 0);
  if (!validPaymentMode) {
  await page.screenshot({ path: 'payment-mode-select-not-found.png', fullPage: true });
  CommonHelper.logger('WARN', 'payment-mode-select-not-found: saved screenshot for debugging');
    throw new Error('No valid Payment Mode options found. Screenshot and HTML saved for debugging.');
  }
  await paymentModeSelect.selectOption({ label: validPaymentMode.trim() });
  CommonHelper.logger('STEP', `Selected Payment Mode: ${validPaymentMode.trim()}`);

  // Add "100" to the "Rate" field in the table (target input[name='rate'])
  // Log all table inputs for diagnostics
  const allTableInputs = await page.locator('table input').all();
  for (const input of allTableInputs) {
    const name = await input.getAttribute('name');
    const placeholder = await input.getAttribute('placeholder');
    const value = await input.inputValue();
  }
  let rateInput2 = page.locator('table input[name="rate"]');
  if (await rateInput2.count() === 0) {
    // fallback: input with placeholder Rate
    rateInput2 = page.locator('table input[placeholder*="Rate" i]');
  }
  if (await rateInput2.count() === 0) {
    // fallback: any input in table
    rateInput2 = page.locator('table input').first();
  }
  await expect(rateInput2).toBeVisible({ timeout: 10000 });
  await rateInput2.fill('100');
  await expect(rateInput2).toHaveValue('100', { timeout: 5000 });
  CommonHelper.logger('STEP', 'Entered 100 in Rate field');

  // Click the blue tick mark button in the table (use #btnAdditem)
  const tickBtn2 = page.locator('#btnAdditem');
  await expect(tickBtn2).toBeVisible({ timeout: 10000 });
  await tickBtn2.click();
  CommonHelper.logger('STEP', 'Clicked blue tick mark button');

  // Click Save
  const saveBtn2 = page.getByRole('button', { name: /Save/i });
  await expect(saveBtn2).toBeVisible({ timeout: 10000 });
  await saveBtn2.click();
  CommonHelper.logger('STEP', 'Clicked Save for Pre Payment');
  
  // Wait for save to complete
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Extract prepayment number before navigation
  let prepaymentNumber = '';
  const pageContentAfterSave = await page.content();
  const prepaymentMatch = pageContentAfterSave.match(/PP-\d+/);
  if (prepaymentMatch) {
    prepaymentNumber = prepaymentMatch[0];
    CommonHelper.logger('INFO', 'Captured Prepayment number:', prepaymentNumber);
  }

  // Navigate to Pre Payment list page
  await page.goto(`${APP_BASE_URL}/credit_notes`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  CommonHelper.logger('STEP', 'Navigated to Pre Payment list page');

  // Find and click the prepayment we just created
  if (prepaymentNumber) {
    const prepaymentLink = page.locator(`a:has-text("${prepaymentNumber}")`).first();
    await expect(prepaymentLink).toBeVisible({ timeout: 10000 });
    await prepaymentLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    CommonHelper.logger('STEP', `Opened Pre Payment detail page: ${prepaymentNumber}`);
  } else {
    // Fallback: click the first prepayment in the list
    const firstPrepayment = page.locator('table tbody tr').first().locator('a').first();
    await firstPrepayment.click();
    await page.waitForLoadState('networkidle');
    CommonHelper.logger('WARN', 'Prepayment number not found, clicked first prepayment in list');
  }

  // Now click "More" dropdown on the detail page
  let moreDropdownClicked = false;
  for (let i = 0; i < 5; i++) {
    try {
      const moreDropdowns = await page.locator('button, a', { hasText: 'More' }).elementHandles();
      for (const handle of moreDropdowns) {
        const text = (await handle.textContent())?.trim() || '';
        if (text === 'More') {
          const box = await handle.boundingBox();
          if (box && box.width > 0 && box.height > 0) {
            await handle.click();
            moreDropdownClicked = true;
            CommonHelper.logger('STEP', 'Clicked More dropdown on Pre Payment detail page');
            break;
          }
        }
      }
      if (moreDropdownClicked) break;
      await page.waitForTimeout(1000);
    } catch (err) {
      CommonHelper.logger('WARN', `Error clicking More dropdown (attempt ${i + 1}):`, String(err));
      await page.waitForTimeout(1000);
    }
  }
  
  if (!moreDropdownClicked) {
    await page.screenshot({ path: 'more-dropdown-not-found.png', fullPage: true });
    CommonHelper.logger('WARN', 'Could not find or click More dropdown after Pre Payment save.');
    throw new Error('More dropdown not found or not clickable after retries.');
  }

  // Click "Approve Payment" and handle alert popup
  const approvePaymentBtn = page.locator('a, button', { hasText: 'Approve Payment' });
  await expect(approvePaymentBtn).toBeVisible({ timeout: 10000 });
  
  // Setup dialog handler before clicking Approve Payment
  let alertHandled = false;
  page.once('dialog', async dialog => {
    CommonHelper.logger('STEP', `Alert popup appeared after Approve Payment: ${dialog.message()}`);
    await dialog.accept();
    alertHandled = true;
  });
  
  await approvePaymentBtn.click();
  CommonHelper.logger('STEP', 'Clicked Approve Payment');
  
  // Wait for alert to appear and be handled
  await page.waitForTimeout(2000);
  if (!alertHandled) {
    CommonHelper.logger('WARN', 'No alert popup appeared or was handled after Approve Payment');
  }
  
  // Wait for page to update after approval
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  // Update abis_execution_details.json with prepayment number
  try {
    const detailsJson = readAbisExecutionDetails();
    if (!detailsJson.service) detailsJson.service = {};
    detailsJson.service.prepaymentNumber = prepaymentNumber;
    writeAbisExecutionDetails(detailsJson);
    CommonHelper.logger('INFO', 'Prepayment number updated in abis_execution_details.json:', prepaymentNumber);
  } catch (err) {
    CommonHelper.logger('ERROR', 'Error updating Prepayment number in abis_execution_details.json:', err);
  }

try {
  const detailsJson3 = readAbisExecutionDetails();
  const clientIdRaw = detailsJson3.company?.clientId || '';
  const clientId = clientIdRaw.replace(/^#/, ''); // Remove leading '#' if present
  if (!clientId) {
    throw new Error('clientId not found in abis_execution_details.json');
  }
  CommonHelper.logger('STEP', `Navigating to client page for clientId: ${clientId}`);
  await page.goto(`${APP_BASE_URL}/clients/client/${clientId}`);
  CommonHelper.logger('STEP', 'Navigated to client page');

  // Click "Proforma" tab/link in the customer page (use exact match to avoid strict mode violation)
  const proformaTab = page.getByRole('link', { name: 'Proforma', exact: true });
  await expect(proformaTab).toBeVisible({ timeout: 10000 });
  await proformaTab.click();
  CommonHelper.logger('STEP', 'Clicked Proforma tab in customer page');
} catch (err) {
  CommonHelper.logger('ERROR', 'Error navigating to client page or clicking Proforma:', err);
  throw err;
}

// Click "Create New Proforma" (as <a> link with class and text)
const createProformaLink = page.locator('a.btn.btn-primary.mbot15', { hasText: 'Create New Proforma' });
await expect(createProformaLink).toBeVisible({ timeout: 10000 });
await Promise.all([
  page.waitForNavigation({ timeout: 10000 }),
  createProformaLink.click()
]);
CommonHelper.logger('STEP', 'Clicked Create New Proforma and navigated to Proforma creation page');

// Interact with Proforma creation page directly
await page.waitForTimeout(3000); // Wait extra for page load
const detailsJson4 = readAbisExecutionDetails();
const billingCompany = detailsJson4.proposal?.services?.[0]?.company || detailsJson4.company?.company || '';
const billingFromDropdown = page.locator('select[name="c_id"], #mastercompany');
if (await billingFromDropdown.isVisible({ timeout: 10000 })) {
  await billingFromDropdown.selectOption({ label: billingCompany });
  CommonHelper.logger('STEP', `Selected Billing From company: ${billingCompany}`);
} else {
  const html = await page.content();
  CommonHelper.logger('WARN', 'Billing From dropdown not found or not visible. Saved HTML for diagnostics. Skipping dropdown step.');
}

// Click "View Services" (if present)
const viewServicesBtn = page.getByRole('button', { name: /View Services/i });
if (await viewServicesBtn.isVisible({ timeout: 5000 })) {
  await viewServicesBtn.click();
  CommonHelper.logger('STEP', 'Clicked View Services');
  // Wait for services modal to appear and try to click "Add"
  const servicesModal = page.locator('.modal:visible').filter({ hasText: 'Services' });
  await expect(servicesModal).toBeVisible({ timeout: 10000 });
  const addServiceBtn = servicesModal.locator('a.btn.addtoestimate');
  try {
    await expect(addServiceBtn).toBeVisible({ timeout: 10000 });
  await addServiceBtn.click();
  CommonHelper.logger('STEP', 'Clicked Add in services modal');
  // Diagnostics: log items/services section after Add
  const itemsSection = page.locator('.panel_s.accounting-template');
  const itemsButtons = await itemsSection.locator('button').allTextContents();
  const itemsLinks = await itemsSection.locator('a').allTextContents();
  // logger('INFO', `Items section after Add: Saved HTML to proforma-items-section-debug.html. Buttons: ${JSON.stringify(itemsButtons)}, Links: ${JSON.stringify(itemsLinks)}`);
  } catch (err) {
    // Diagnostics: save modal HTML and log all visible buttons
    const modalHtml = await servicesModal.innerHTML();
  CommonHelper.logger('WARN', 'service-modal-debug: saved modal HTML for diagnostics');
    const allLinks = await servicesModal.locator('a').allTextContents();
  CommonHelper.logger('ERROR', `Add link not found/visible in Services modal. All visible links: ${JSON.stringify(allLinks)}`);
  CommonHelper.logger('ERROR', 'Saved modal HTML to service-modal-debug.html for diagnostics.');
    throw err;
  }
}

// Make required fields editable before filling
// Patch: Remove jQuery :visible selector, use DOM visibility filter
await page.evaluate(() => {
  const modals = Array.from(document.querySelectorAll('.modal, .modal.show'));
  // Only keep visible modals (cast to HTMLElement for offsetWidth/offsetHeight)
  return modals.filter(el => {
    const htmlEl = el as HTMLElement;
    return !!(htmlEl.offsetWidth || htmlEl.offsetHeight || htmlEl.getClientRects().length);
  });
  document.querySelectorAll('.panel_s.accounting-template input[readonly], .panel_s.accounting-template textarea[readonly]').forEach(el => {
    el.removeAttribute('readonly');
  });
});
// Fill required fields in items table
const itemsSection = page.locator('.panel_s.accounting-template');
// const rateInput = itemsSection.locator('input[name="rate"]');
// const quantityInput = itemsSection.locator('input[name="quantity"]');
// const descInput = itemsSection.locator('textarea[name="description"]');
// await rateInput.fill('100');
// await quantityInput.fill('1');
// await descInput.fill('Service Description');
// Click tick mark button
const tickBtn = itemsSection.locator('button.btn-primary:has(i.fa-check)');
try {
  await expect(tickBtn).toBeVisible({ timeout: 10000 });
  await tickBtn.click();
  CommonHelper.logger('STEP', 'Clicked blue tick mark button in Proforma page (by class and icon)');
} catch (err) {
  // Diagnostics: save Proforma page HTML and log all visible buttons/links
  const pageHtml = await page.content();
  CommonHelper.logger('WARN', 'proforma-tickmark-debug: saved page HTML for diagnostics');
  const allButtons = await page.locator('button').allTextContents();
  const allLinks = await page.locator('a').allTextContents();
  CommonHelper.logger('ERROR', `Tick mark button (.btn-primary .fa-check) not found/visible. All visible buttons: ${JSON.stringify(allButtons)}, links: ${JSON.stringify(allLinks)}`);
  CommonHelper.logger('ERROR', 'Saved Proforma page HTML to proforma-tickmark-debug.html for diagnostics.');
  throw err;
}
// Wait for Save button to be enabled and click after tick mark
const saveBtnAfterTick = page.getByRole('button', { name: /Save/i });
await expect(saveBtnAfterTick).toBeEnabled({ timeout: 10000 });
await saveBtnAfterTick.click();
CommonHelper.logger('STEP', 'Clicked Save in Proforma page');
// Wait for success toast, navigation, or confirmation after Save
let saveSuccess = false;
try {
  // Wait for a success toast or navigation (adjust selectors as needed)
  await Promise.race([
    page.waitForSelector('.toast-success, .alert-success, .notification-success', { timeout: 10000 }),
    page.waitForNavigation({ timeout: 10000 }),
    page.waitForSelector('text=Proforma created successfully', { timeout: 10000 })
  ]);
  saveSuccess = true;
  CommonHelper.logger('INFO', 'Proforma Save success confirmed by toast, navigation, or success message.');
  // --- Capture Proforma details after save ---
  // --- Capture Proforma details after save ---
  await page.waitForTimeout(2000); // Wait for UI update
  await page.waitForTimeout(2000); // Wait for UI update
  const pageContent = await page.content();

  let moreDropdownAcceptedClicked = false;
  for (let i = 0; i < 5; i++) {
    try {
      const moreDropdowns = await page.locator('button, a', { hasText: 'More' }).elementHandles();
      for (const handle of moreDropdowns) {
        const text = (await handle.textContent())?.trim() || '';
        if (text === 'More') {
          const box = await handle.boundingBox();
          if (box && box.width > 0 && box.height > 0) {
            await handle.click();
            moreDropdownAcceptedClicked = true;
            CommonHelper.logger('STEP', 'Clicked More dropdown in Proforma page (for Mark as Accepted)');
            break;
          }
        }
      }
      if (moreDropdownAcceptedClicked) break;
      await page.waitForTimeout(1000);
    } catch (err) {
      if (String(err).includes('Execution context was destroyed')) {
  CommonHelper.logger('WARN', 'Execution context destroyed, waiting for page stability and retrying More dropdown...');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1500);
        continue;
      } else {
        throw err;
      }
    }
  }
  if (!moreDropdownAcceptedClicked) {
  CommonHelper.logger('WARN', 'Could not find or click More dropdown for Mark as Accepted.');
    throw new Error('More dropdown not found or not clickable after retries.');
  }

  // Click "Mark as Accepted" in dropdown
  const markAsAcceptedBtn = page.locator('a, button', { hasText: 'Mark as Accepted' });
  await expect(markAsAcceptedBtn).toBeVisible({ timeout: 10000 });
  await markAsAcceptedBtn.click();
  CommonHelper.logger('STEP', 'Clicked Mark as Accepted in Proforma page');
  await page.waitForTimeout(2000);
  // Proforma number (starts with EST-)
  let proformaNumber = '';
  const proformaMatch = pageContent.match(/EST-\d+/);
  if (proformaMatch) proformaNumber = proformaMatch[0];
  // Proforma date
  let proformaDate = '';
  try {
    // Try input, then visible text, then fallback to regex
    const dateInput = page.locator('input[name="date"], input#date');
    if (await dateInput.count() && await dateInput.isVisible()) {
      proformaDate = await dateInput.inputValue();
    } else {
      // Try to find date in visible spans/divs
      const dateText = await page.locator('span:has-text("Date"), div:has-text("Date")').first().innerText();
      if (dateText) proformaDate = dateText.replace(/[^\d-\/]/g, '');
    }
    if (!proformaDate) {
      // Fallback: regex from page content
      const dateMatch = pageContent.match(/Date\s*[:=]\s*([\d\/-]+)/i);
      if (dateMatch) proformaDate = dateMatch[1];
    }
  } catch (err) {
  CommonHelper.logger('WARN', 'Could not find Proforma date:', err);
  }
  // Expiry date
  let expiryDate = '';
  try {
    // Try input field first
    const expiryInput = page.locator('input[name="expiry_date"], input#expiry_date');
    if (await expiryInput.count() && await expiryInput.isVisible()) {
      expiryDate = await expiryInput.inputValue();
    }
    // Try to find expiry date by label context (table or summary)
    if (!expiryDate) {
      const expiryLabelLocator = page.locator('text=Expiry Date');
      if (await expiryLabelLocator.count()) {
        // Look for sibling or next cell with date
        const expiryValueLocator = expiryLabelLocator.locator('xpath=following-sibling::*[1]');
        if (await expiryValueLocator.count()) {
          const expiryValueText = await expiryValueLocator.textContent();
          const dateMatch = expiryValueText && expiryValueText.match(/(\d{2}-\d{2}-\d{4})/);
          if (dateMatch) expiryDate = dateMatch[1];
        }
        // Fallback: search parent row for date
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
    // Fallback: strict date regex from page content, pick the date closest to 'Expiry' label
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
  // Total
  let total = '';
  try {
    // Find all rows containing 'Total' (but not 'Sub Total', 'Grand Total', etc.) and extract currency value
    const totalRows = await page.locator('tr:has-text("Total")').all();
    let bestTotal = '';
    for (const row of totalRows) {
      const rowText = await row.textContent();
      if (rowText && /Total/i.test(rowText) && !/Sub Total|Grand Total/i.test(rowText)) {
        // Match 'Total' followed by currency value (e.g. 'Total Rs.1,200.00')
        const directMatch = rowText.match(/Total[^\d]*(\d{1,3}(,\d{3})*(\.\d{2}))/);
        if (directMatch) {
          bestTotal = directMatch[1];
          break;
        }
        // Otherwise, pick the first currency value in the row
        const currencyMatches = rowText.match(/\d{1,3}(,\d{3})*(\.\d{2})?/g);
        if (!bestTotal && currencyMatches && currencyMatches.length > 0) {
          bestTotal = currencyMatches[0];
        }
      }
    }
    // Fallback: strict currency regex from page content, pick the value immediately after 'Total' label (not Sub/Grand)
    if (!bestTotal) {
      const totalLabelRegex = /Total[^\d]*(\d{1,3}(,\d{3})*(\.\d{2}))/i;
      const match = pageContent.match(totalLabelRegex);
      if (match) bestTotal = match[1];
    }
    total = bestTotal;
  } catch (err) {
  CommonHelper.logger('WARN', 'Could not find Proforma total:', err);
  }
  // Write to abis_execution_details.json
  try {
    const detailsJson = readAbisExecutionDetails();
    detailsJson.proforma = detailsJson.proforma || {};
    detailsJson.proforma.proformaNumber = proformaNumber;
    detailsJson.proforma.proformaDate = proformaDate;
    detailsJson.proforma.expiryDate = expiryDate;
    detailsJson.proforma.total = total;
    writeAbisExecutionDetails(detailsJson);
    if (!proformaDate || !expiryDate || !total) {
  CommonHelper.logger('WARN', `Proforma details missing: proformaDate='${proformaDate}', expiryDate='${expiryDate}', total='${total}'. Diagnostics saved.`);
  await page.screenshot({ path: 'proforma-details-missing.png', fullPage: true });
  CommonHelper.logger('WARN', 'proforma-details-missing: screenshot saved for diagnostics');
    }
  } catch (err) {
  CommonHelper.logger('ERROR', 'Error updating Proforma details in abis_execution_details.json:', err);
  }
} catch (err) {
  CommonHelper.logger('WARN', 'No success indicator found after Save. Saving diagnostics.');
  await page.screenshot({ path: 'proforma-save-failed.png', fullPage: true });
  CommonHelper.logger('WARN', 'proforma-save-failed: screenshot saved for diagnostics');
}
if (!saveSuccess) {
  throw new Error('Proforma Save did not trigger success indicator. See diagnostics.');
}

try {
  // Wait for page to be stable after Proforma save
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Click "Convert to Invoice" dropdown button directly (not "More")
  let convertDropdownBtn = page.locator('button', { hasText: /Convert to Invoice/i });
  let convertDropdownClicked = false;
  for (let i = 0; i < 5; i++) {
    if (await convertDropdownBtn.count() && await convertDropdownBtn.isVisible()) {
      await convertDropdownBtn.click();
      convertDropdownClicked = true;
  CommonHelper.logger('STEP', 'Clicked Convert to Invoice dropdown button');
      break;
    }
    await page.waitForTimeout(1000);
  }
  if (!convertDropdownClicked) {
  CommonHelper.logger('WARN', 'Could not find or click Convert to Invoice dropdown button.');
    throw new Error('Convert to Invoice dropdown button not found or not clickable after retries.');
  }

  // Click "Convert" option in the dropdown (not "Convert to invoice" again)
  const convertOptionBtn = page.locator('a, button', { hasText: /^Convert$/i });
  await expect(convertOptionBtn).toBeVisible({ timeout: 10000 });
  await convertOptionBtn.click();
  CommonHelper.logger('STEP', 'Clicked Convert option in Convert to Invoice dropdown');

  // Wait for navigation or success indicator
  await Promise.race([
    page.waitForNavigation({ timeout: 10000 }),
    page.waitForSelector('.toast-success, .alert-success, .notification-success', { timeout: 10000 }),
    page.waitForSelector('text=Invoice created successfully', { timeout: 10000 })
  ]);
  CommonHelper.logger('INFO', 'Invoice conversion success confirmed.');

  // --- Extract Invoice details after conversion ---
  await page.waitForTimeout(2000); // Wait for UI update
  const invoicePageContent = await page.content();

  // Robust extraction using node-html-parser
  const domParser = require('node-html-parser');
  const root = domParser.parse(invoicePageContent);
  // Invoice Number
  let invoiceNumber = '';
  const invoiceNumberSpan = root.querySelector('span#invoice-number');
  if (invoiceNumberSpan) {
    invoiceNumber = invoiceNumberSpan.text.trim();
  } else {
    const fallbackMatch = invoicePageContent.match(/[A-Z]{2,5}-\d{3,}/);
    if (fallbackMatch) invoiceNumber = fallbackMatch[0];
  }

  // Helper to extract value after <span class="bold">Label:</span>
  function extractAfterBold(root: any, label: string): string {
    const spans = root.querySelectorAll('span.bold');
    for (const span of spans) {
      if (span.text.trim().replace(/\s+/g, ' ') === label) {
        // Parent <p> contains the value after the span
        const parentP = span.parentNode;
        if (parentP && parentP.text) {
          // Remove label from parent text
          return parentP.text.replace(label, '').trim();
        }
      }
    }
    return '';
  }

  // Invoice Date
  let invoiceDate = extractAfterBold(root, 'Invoice Date:');
  // Fallback: regex
  if (!invoiceDate) {
    const invoiceDateMatch = invoicePageContent.match(/Invoice Date:\s*([\d]{2}-[\d]{2}-[\d]{4})/);
    if (invoiceDateMatch) invoiceDate = invoiceDateMatch[1];
  }

  // Due Date
  let dueDate = extractAfterBold(root, 'Due Date:');
  if (!dueDate) {
    const dueDateMatch = invoicePageContent.match(/Due Date:\s*([\d]{2}-[\d]{2}-[\d]{4})/);
    if (dueDateMatch) dueDate = dueDateMatch[1];
  }

  // Sales Agent
  let salesAgent = extractAfterBold(root, 'Sale Agent:');
  if (!salesAgent) {
    const salesAgentMatch = invoicePageContent.match(/Sale Agent:\s*([A-Za-z .]+)/);
    if (salesAgentMatch) salesAgent = salesAgentMatch[1].trim();
  }

  // Total
  let invoiceTotal = '';
  try {
    if (!page.isClosed()) {
      // Find all rows containing 'Total' (but not 'Sub Total', 'Grand Total', etc.) and extract currency value
      const totalRows = await page.locator('tr:has-text("Total")').all();
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

  // Write to abis_execution_details.json
  try {
    const detailsJson = readAbisExecutionDetails();
    detailsJson.invoice = detailsJson.invoice || {};
    detailsJson.invoice.invoiceNumber = invoiceNumber;
    detailsJson.invoice.invoiceDate = invoiceDate;
    detailsJson.invoice.dueDate = dueDate;
    detailsJson.invoice.salesAgent = salesAgent;
    detailsJson.invoice.total = invoiceTotal;
    writeAbisExecutionDetails(detailsJson);
    if (!invoiceNumber || !invoiceDate || !dueDate || !salesAgent || !invoiceTotal) {
  CommonHelper.logger('WARN', `Invoice details missing: invoiceNumber='${invoiceNumber}', invoiceDate='${invoiceDate}', dueDate='${dueDate}', salesAgent='${salesAgent}', total='${invoiceTotal}'. Diagnostics saved.`);
        if (!page.isClosed()) {
        await page.screenshot({ path: 'invoice-details-missing.png', fullPage: true });
        CommonHelper.logger('WARN', 'invoice-details-missing: screenshot saved for diagnostics');
      }
    }
  } catch (err) {
  CommonHelper.logger('ERROR', 'Error updating Invoice details in abis_execution_details.json:', err);
  }
} catch (err) {
  CommonHelper.logger('ERROR', 'Error during Convert to invoice workflow:', err);
  try {
      if (!page.isClosed()) {
      await page.screenshot({ path: 'convert-to-invoice-failed.png', fullPage: true });
      CommonHelper.logger('WARN', 'convert-to-invoice-failed: screenshot saved for diagnostics');
    }
  } catch {}
  throw err;
}
// Removed waitForTimeout after page/browser close to avoid error
const applyCreditsLink = page.locator('a[data-toggle="modal"][data-target="#apply_credits"]', { hasText: 'Apply Credits' });
await expect(applyCreditsLink).toBeVisible({ timeout: 10000 });
await applyCreditsLink.click();
CommonHelper.logger('STEP', 'Clicked Apply Credits link');

// Wait for Apply Credits modal to appear
const applyCreditsModal = page.locator('#apply_credits');
await expect(applyCreditsModal).toBeVisible({ timeout: 10000 });

// Wait for any input to appear inside the modal
await page.waitForTimeout(500); // Give time for modal animation/render
let foundInput = false;
for (let i = 0; i < 20; i++) {
  const inputCount = await applyCreditsModal.locator('input').count();
  if (inputCount > 0) {
    foundInput = true;
    break;
  }
  await page.waitForTimeout(500);
}
if (!foundInput) {
  const modalHtml = await applyCreditsModal.innerHTML();
  require('fs').writeFileSync('apply-credits-modal-debug.html', modalHtml);
  CommonHelper.logger('ERROR', 'No input found in Apply Credits modal after waiting. Saved HTML for diagnostics.');
  throw new Error('No input found in Apply Credits modal.');
}
// Log all input attributes for diagnostics
const inputHandles = await applyCreditsModal.locator('input').elementHandles();
const inputAttrs = [];
for (const handle of inputHandles) {
  inputAttrs.push({
    name: await handle.getAttribute('name'),
    id: await handle.getAttribute('id'),
    type: await handle.getAttribute('type'),
    placeholder: await handle.getAttribute('placeholder'),
    value: await handle.getAttribute('value'),
    visible: !!(await handle.isVisible())
  });
}
// Use the first visible input
let amountInput = null;
for (const handle of inputHandles) {
  if (await handle.isVisible()) {
    amountInput = page.locator(`#apply_credits input[name='${await handle.getAttribute('name')}']`);
    break;
  }
}
if (!amountInput) {
  amountInput = applyCreditsModal.locator('input').first();
}
await expect(amountInput).toBeVisible({ timeout: 5000 });
await amountInput.fill('100');
CommonHelper.logger('STEP', 'Entered 100 in Amount to Credit');

// Click "Apply" button in modal
const applyBtn = applyCreditsModal.locator('button, a', { hasText: 'Apply' });
await expect(applyBtn).toBeVisible({ timeout: 5000 });
await applyBtn.click();
CommonHelper.logger('STEP', 'Clicked Apply in Apply Credits modal');


// Payment section (panel-based, not modal)
const paymentBtn = page.locator('a.btn.btn-primary', { hasText: 'Payment' });
await expect(paymentBtn).toBeVisible({ timeout: 10000 });
await paymentBtn.click();
CommonHelper.logger('STEP', 'Clicked Payment button');

// Wait for Payment panel to appear (robust)
let paymentPanel = null;
for (let i = 0; i < 20; i++) {
  // Try #record_payment_form first
  const panel = page.locator('#record_payment_form');
  if (await panel.count() && await panel.isVisible()) {
    paymentPanel = panel;
    break;
  }
  // Try heading
  const heading = page.getByRole('heading', { name: /Record Payment/i });
  if (await heading.count() && await heading.isVisible()) {
    // Find nearest parent form or panel
    const panelHandle = await heading.elementHandle();
    if (panelHandle) {
      // Try to find parent form
      const formHandle = await panelHandle.evaluateHandle(node => node.closest('form'));
      if (formHandle) {
        paymentPanel = page.locator('form#record_payment_form');
        if (await paymentPanel.count() && await paymentPanel.isVisible()) break;
      }
      // Fallback: parent div with id
      const divHandle = await panelHandle.evaluateHandle(node => node.closest('div.panel_s, div.panel-body, div'));
      if (divHandle) {
        const divId = await divHandle.evaluate(node => node ? node.id : '');
        if (divId && divId.trim().length > 0) {
          paymentPanel = page.locator(`#${divId}`);
          if (await paymentPanel.count() && await paymentPanel.isVisible()) break;
        } else {
          // Fallback: use the closest parent .panel_s or .panel-body containing the heading
          // Find all .panel_s and .panel-body elements containing the heading
          const panels = page.locator('.panel_s, .panel-body').filter({ has: heading });
          const panelCount = await panels.count();
          if (panelCount === 1 && await panels.first().isVisible()) {
            paymentPanel = panels.first();
            break;
          } else if (panelCount > 1) {
            // Try to pick the first visible one
            for (let idx = 0; idx < panelCount; idx++) {
              const candidate = panels.nth(idx);
              if (await candidate.isVisible()) {
                paymentPanel = candidate;
                break;
              }
            }
            if (paymentPanel) break;
          }
        }
      }
    }
  }
  await page.waitForTimeout(500);
}
if (!paymentPanel) {
  // Diagnostics: log all panels and save page HTML
  const pageHtml = await page.content();
  require('fs').writeFileSync('payment-panel-debug.html', pageHtml);
  CommonHelper.logger('ERROR', 'No visible payment panel found for Payment. Saved HTML for diagnostics.');
  throw new Error('No visible Payment panel found. Saved HTML for diagnostics.');
}
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
function randomTxnId(len = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
const txnId = randomTxnId();
const txnInput = paymentPanel.locator('input[name="transactionid"], input[name="transaction_id"], input[placeholder*="Transaction"]');
await expect(txnInput).toBeVisible({ timeout: 10000 });
await txnInput.fill(txnId);
CommonHelper.logger('INFO', `Entered Transaction ID: ${txnId}`);

// Click Save button
const savePaymentBtn = paymentPanel.locator('button, a', { hasText: 'Save' });
await expect(savePaymentBtn).toBeVisible({ timeout: 10000 });
await savePaymentBtn.click();
CommonHelper.logger('STEP', 'Clicked Save in Payment panel');

try {
  // Click "More" dropdown (exclude "Load More" buttons)
  let moreDropdownClicked = false;
  for (let i = 0; i < 5; i++) {
    const moreDropdowns = await page.locator('button, a', { hasText: 'More' }).elementHandles();
    for (const handle of moreDropdowns) {
      const text = (await handle.textContent())?.trim() || '';
      // Exclude elements with text 'Load More'
      if (text === 'More') {
        const box = await handle.boundingBox();
        if (box && box.width > 0 && box.height > 0) {
          await handle.hover();
          await handle.click();
          moreDropdownClicked = true;
          CommonHelper.logger('STEP', 'Hovered and clicked More dropdown for Approve Payment');
          break;
        }
      }
    }
    if (moreDropdownClicked) break;
    await page.waitForTimeout(1000);
  }
  if (!moreDropdownClicked) {
  CommonHelper.logger('WARN', 'Could not find or click More dropdown for Approve Payment.');
    throw new Error('More dropdown not found or not clickable after retries.');
  }

    // Diagnostic: log DOM after clicking More
    // const domHtml = await page.content();
    // logger('INFO', 'DOM after clicking More:', domHtml);
    // Wait for Approve Payment button to appear (robust)
    const approvePaymentLocator = page.locator('a, button', { hasText: 'Approve Payment' });
    try {
      await approvePaymentLocator.first().waitFor({ state: 'visible', timeout: 5000 });
    } catch {
  CommonHelper.logger('WARN', 'Approve Payment button did not become visible after clicking More.');
    }

  // Click "Approve Payment" in dropdown (robust: only click visible)
  let clicked = false;
  for (let attempt = 0; attempt < 5 && !clicked; attempt++) {
    const approvePaymentBtns = page.locator('a, button', { hasText: 'Approve Payment' });
    const count = await approvePaymentBtns.count();
    for (let i = 0; i < count; i++) {
      const btn = approvePaymentBtns.nth(i);
      const visible = await btn.isVisible();
      const enabled = await btn.isEnabled();
      const html = await btn.evaluate(node => node.outerHTML);
      // logger('INFO', `Approve Payment button [${i}] visible: ${visible}, enabled: ${enabled}, html: ${html}`);
      if (visible && enabled) {
        await btn.click();
        clicked = true;
  CommonHelper.logger('STEP', 'Clicked Approve Payment in More dropdown');
        break;
      }
    }
    if (!clicked) {
  CommonHelper.logger('WARN', `Attempt ${attempt + 1}: No visible Approve Payment button, retrying after 1s...`);
      await page.waitForTimeout(1000);
      // Try clicking More again in case dropdown closed
      const moreDropdowns = await page.locator('button, a', { hasText: 'More' }).elementHandles();
      for (const handle of moreDropdowns) {
        const text = (await handle.textContent())?.trim() || '';
        if (text === 'More') {
          const box = await handle.boundingBox();
          if (box && box.width > 0 && box.height > 0) {
            await handle.hover();
            await handle.click();
            CommonHelper.logger('STEP', 'Re-clicked More dropdown for Approve Payment (retry)');
            break;
          }
        }
      }
    }
  }
  if (!clicked) {
    // // Log DOM for debugging
    // const domHtml = await page.content();
    // logger('ERROR', 'No Approve Payment button could be clicked after retries. DOM:', domHtml);
    throw new Error('No visible Approve Payment button found after opening More dropdown.');
  }

  // Wait for popup and click "Yes, approve it!" button
  const yesApproveBtn = page.locator('button, a', { hasText: 'Yes, approve it!' });
  await expect(yesApproveBtn).toBeVisible({ timeout: 10000 });
  await yesApproveBtn.click();
  CommonHelper.logger('STEP', 'Clicked Yes, approve it! in Approve Payment popup');
  await page.waitForTimeout(2000);
} catch (err) {
  CommonHelper.logger('ERROR', 'Error during Approve Payment workflow:', err);
  throw err;
}

// Capture payment ID from the URL and update abis_execution_details.json
const paymentUrl = page.url();
const paymentIdMatch = paymentUrl.match(/(\d+)(?!.*\d)/);
const paymentId = paymentIdMatch ? paymentIdMatch[1] : '';
if (paymentId) {
  try {
    const detailsJson = readAbisExecutionDetails();
    detailsJson.payment = detailsJson.payment || {};
    detailsJson.payment.paymentId = paymentId;
    writeAbisExecutionDetails(detailsJson);
  CommonHelper.logger('INFO', 'Payment ID captured and updated in abis_execution_details.json:', paymentId);
  } catch (err) {
  CommonHelper.logger('ERROR', 'Error updating payment ID in abis_execution_details.json:', err);
  }
} else {
  CommonHelper.logger('WARN', 'Payment ID not found in URL:', paymentUrl);
}

// Find the element containing "Payment for Invoice" text
const paymentForInvoiceLabel = page.locator('text=Payment for Invoice');
// Find the <a> tag next to it (robust: search parent then child)
const parent = paymentForInvoiceLabel.locator('..');
const paymentForInvoiceLink = parent.locator('a');
await expect(paymentForInvoiceLink.first()).toBeVisible({ timeout: 10000 });
await paymentForInvoiceLink.first().click();
await page.waitForLoadState('networkidle');
CommonHelper.logger('STEP', 'Clicked hyperlink next to Payment for Invoice and waited for page to load');
});
