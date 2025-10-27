import { login } from '../../utils/loginHelper';
import { LeadHelper, LeadDetails } from '../../utils/sanity/leadHelper';
import { ProposalHelper, ProposalDetails } from '../../utils/sanity/proposalHelper';
import { CustomerHelper } from '../../utils/sanity/customerHelper';
import { ServiceHelper } from '../../utils/sanity/serviceHelper';
import { TaskHelper } from '../../utils/sanity/taskHelper';
import { ProformaHelper } from '../../utils/sanity/proformaHelper';
import { InvoiceHelper } from '../../utils/sanity/invoiceHelper';
import { readAbisExecutionDetails, writeAbisExecutionDetails } from '../../utils/jsonWriteHelper';
import { CommonHelper } from '../../utils/commonHelper';
import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';

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
  const { leadId, name, email, phone, company, address, city, state: selectedState, zip } = lead;

  // Create proposal via helper
  const proposalHelper = new ProposalHelper(page);
  const proposal: ProposalDetails = await proposalHelper.createAndProcessProposal('#lead-modal');
  const { proposalNumber: proposalNumberHtml, services: selectedServices } = proposal;

  // Go to /leads page
  const leadName = name;
  await page.goto(`${APP_BASE_URL}/leads`);
  
  // Find the datatable search box (try multiple selectors)
  let searchInput = page.locator('table thead input[type="search"]').first();
  if (await searchInput.count() === 0) {
    searchInput = page.locator('table input[type="search"]').first();
  }
  if (await searchInput.count() === 0) {
    searchInput = page.locator('input[placeholder*="search" i]').first();
  }
  await expect(searchInput).toBeVisible({ timeout: 10000 });
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
      leadId,
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

  // Click "New Pre Payment" link
  const newPrePaymentLink = page.getByRole('link', { name: /New Pre Payment/i });
  await expect(newPrePaymentLink).toBeVisible({ timeout: 10000 });
  await newPrePaymentLink.click();
  CommonHelper.logger('STEP', 'Clicked New Pre Payment link');

  // Wait for New Pre Payment modal/form to appear
  const newPrePaymentHeading = page.getByRole('heading', { name: /New Pre Payment/i });
  await expect(newPrePaymentHeading).toBeVisible({ timeout: 15000 });

  // Select service from dropdown with AJAX search
  const serviceDropdownButton = page.locator('button[data-id="project_id"]');
  try {
    await serviceDropdownButton.waitFor({ state: 'visible', timeout: 15000 });
    await serviceDropdownButton.click();
    CommonHelper.logger('STEP', 'Clicked service dropdown button');
    
    const serviceSearchInput = page.locator('#project_ajax_search_wrapper .bs-searchbox input');
    await serviceSearchInput.waitFor({ state: 'visible', timeout: 10000 });
    
    // Wait for dropdown to be ready before typing
    await page.waitForTimeout(1000);
    
    // Use only a space ' ' to trigger service list
    await serviceSearchInput.type(' ', { delay: 100 });
    CommonHelper.logger('STEP', 'Typed space in service search to trigger AJAX');
    
    // Wait longer for AJAX response in Docker environment
    await page.waitForTimeout(2000); // Increased from 500ms to 2000ms for Docker
    
    // Wait for options to appear with better error handling
    try {
      await page.waitForFunction(() => {
        const options = Array.from(document.querySelectorAll('#project_ajax_search_wrapper .inner.open ul li a span.text'));
        return options.some(opt => opt.textContent && opt.textContent.trim().length > 0);
      }, { timeout: 10000 }); // Increased from 7s to 10s
      
      // Log available options for diagnostics
      const options = await page.$$eval('#project_ajax_search_wrapper .inner.open ul li a span.text', nodes => nodes.map(n => n.textContent));
      CommonHelper.logger('INFO', `Service options found: ${options.length} items`);
      
      // Click the first non-empty option
      const firstOption = page.locator('#project_ajax_search_wrapper .inner.open ul li a span.text').filter({ hasText: /.+/ }).first();
      await firstOption.click();
      CommonHelper.logger('STEP', 'Selected first service option');
    } catch (optionError) {
      // Enhanced diagnostics on failure
      const dropdownHtml = await page.locator('#project_ajax_search_wrapper').innerHTML().catch(() => 'Could not capture HTML');
      CommonHelper.logger('ERROR', 'service-dropdown-debug: ' + dropdownHtml.substring(0, 500));
      await CommonHelper.safeScreenshot(page, { path: 'service-dropdown-no-options.png', fullPage: true });
      throw new Error('No service options found after space AJAX search. AJAX may have timed out or returned no results.');
    }
  } catch (e) {
    await CommonHelper.safeScreenshot(page, { path: 'service-dropdown-arrow-fail.png', fullPage: true });
    CommonHelper.logger('ERROR', 'service-dropdown-arrow-fail: ' + (e as Error).message);
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
  await CommonHelper.safeScreenshot(page, { path: 'payment-mode-select-not-found.png', fullPage: true });
  CommonHelper.logger('WARN', 'payment-mode-select-not-found: saved screenshot for debugging');
    throw new Error('No valid Payment Mode options found. Screenshot and HTML saved for debugging.');
  }
  await paymentModeSelect.selectOption({ label: validPaymentMode.trim() });
  CommonHelper.logger('STEP', `Selected Payment Mode: ${validPaymentMode.trim()}`);

  // Enter rate value in the table
  let rateInput = page.locator('table input[name="rate"]');
  if (await rateInput.count() === 0) {
    rateInput = page.locator('table input[placeholder*="Rate" i]');
  }
  if (await rateInput.count() === 0) {
    rateInput = page.locator('table input').first();
  }
  await expect(rateInput).toBeVisible({ timeout: 10000 });
  await rateInput.fill('100');
  await expect(rateInput).toHaveValue('100', { timeout: 5000 });
  CommonHelper.logger('STEP', 'Entered 100 in Rate field');

  // Click the blue tick mark button in the table
  const tickBtn = page.locator('#btnAdditem');
  await expect(tickBtn).toBeVisible({ timeout: 10000 });
  await tickBtn.click();
  CommonHelper.logger('STEP', 'Clicked blue tick mark button');

  // Click Save
  const saveBtn = page.getByRole('button', { name: /Save/i });
  await expect(saveBtn).toBeVisible({ timeout: 10000 });
  await saveBtn.click();
  CommonHelper.logger('STEP', 'Clicked Save for Pre Payment');
  
  // Wait for navigation to complete after save
  await page.waitForURL(/credit_notes/, { timeout: 15000 }).catch(() => {
    CommonHelper.logger('WARN', 'Did not navigate to credit_notes page as expected');
  });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => {
    CommonHelper.logger('WARN', 'networkidle timeout, proceeding anyway');
  });
  await page.waitForTimeout(2000);

  // Extract prepayment number from the page after navigation completes
  let prepaymentNumber = '';
  try {
    const prepaymentMatch = (await page.content()).match(/PP-\d+/);
    if (prepaymentMatch) {
      prepaymentNumber = prepaymentMatch[0];
      CommonHelper.logger('INFO', 'Captured Prepayment number:', prepaymentNumber);
    } else {
      // Try alternative: look in URL or page heading
      const urlMatch = page.url().match(/credit_notes\/(\d+)/);
      if (urlMatch) {
        const heading = await page.locator('h4, h3, h2').first().textContent().catch(() => '');
        const headingMatch = heading?.match(/PP-\d+/);
        if (headingMatch) {
          prepaymentNumber = headingMatch[0];
          CommonHelper.logger('INFO', 'Captured Prepayment number from heading:', prepaymentNumber);
        }
      }
    }
  } catch (err) {
    CommonHelper.logger('WARN', 'Could not extract prepayment number:', err);
  }

  // If we're not on the detail page, navigate to the list and find the latest
  if (!page.url().includes('credit_notes/view')) {
    CommonHelper.logger('INFO', 'Not on detail page, navigating to Pre Payment list');
    await page.goto(`${APP_BASE_URL}/credit_notes`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    CommonHelper.logger('STEP', 'Navigated to Pre Payment list page');
  }

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
    await CommonHelper.safeScreenshot(page, { path: 'more-dropdown-not-found.png', fullPage: true });
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

  // Create Proforma and mark as accepted
  const proformaDetailsJson = readAbisExecutionDetails();
  const clientIdRaw = proformaDetailsJson.company?.clientId || '';
  const proformaClientId = clientIdRaw.replace(/^#/, ''); // Remove leading '#' if present
  if (!proformaClientId) {
    throw new Error('clientId not found in abis_execution_details.json');
  }
  if (!APP_BASE_URL) {
    throw new Error('APP_BASE_URL is not defined');
  }

  const proformaHelper = new ProformaHelper(page);
  await proformaHelper.createAndAcceptProforma(proformaClientId, APP_BASE_URL);

  // Convert to Invoice and complete payment
  const invoiceHelper = new InvoiceHelper(page);
  await invoiceHelper.processInvoiceWorkflow();
});

