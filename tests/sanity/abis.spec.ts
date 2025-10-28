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
// Set faker locale to India for Indian names and addresses
faker.locale = 'en_IND';

dotenv.config();

const APP_BASE_URL = process.env.APP_BASE_URL;
const E2E_USER = process.env.E2E_USER;
const E2E_PASS = process.env.E2E_PASS;

test('ABIS Sanity @sanity', async ({ page }) => {
  test.setTimeout(300000); // 5 minutes
  CommonHelper.logger('INFO', 'Starting ABIS Sanity Test');
  CommonHelper.logger('INFO', `Using APP URL: ${APP_BASE_URL}`);
  CommonHelper.logger('INFO', `Using USERNAME: ${E2E_USER}`);
  
  let leadId: string, name: string, email: string, phone: string, company: string;
  let address: string, city: string, selectedState: string | null, zip: string;
  let proposalNumberHtml: string, selectedServices: any[];
  let clientId: string, customerAdmin: string;
  let serviceNumber: string, serviceName: string, deadline: string;
  let prepaymentNumber = '';

  await test.step('1. Login', async () => {
    await login(page, APP_BASE_URL!, E2E_USER!, E2E_PASS!);
  });

  await test.step('2. Create Lead', async () => {
    const leadHelper = new LeadHelper(page, APP_BASE_URL!);
    const lead: LeadDetails = await leadHelper.createLead();
    ({ leadId, name, email, phone, company, address, city, state: selectedState, zip } = lead);

    try {
      writeAbisExecutionDetails({
        lead: { leadId, name, email, phone, address, city, state: selectedState, zip }
      });
    } catch (err) {
      CommonHelper.logger('ERROR', 'Error saving lead details to JSON:', err);
    }
  });

  await test.step('3. Create and Accept Proposal', async () => {
    const proposalHelper = new ProposalHelper(page);
    const proposal: ProposalDetails = await proposalHelper.createAndProcessProposal('#lead-modal');
    ({ proposalNumber: proposalNumberHtml, services: selectedServices } = proposal);

    try {
      const detailsJson = readAbisExecutionDetails();
      detailsJson.proposal = { proposalNumber: proposalNumberHtml || '', services: selectedServices };
      writeAbisExecutionDetails(detailsJson);
    } catch (err) {
      CommonHelper.logger('ERROR', 'Error saving proposal details to JSON:', err);
    }
  });

  await test.step('4. Convert Lead to Customer', async () => {
    await page.goto(`${APP_BASE_URL}/leads`);
    
    let searchInput = page.locator('table thead input[type="search"]').first();
    if (await searchInput.count() === 0) searchInput = page.locator('table input[type="search"]').first();
    if (await searchInput.count() === 0) searchInput = page.locator('input[placeholder*="search" i]').first();
    
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill(name);
    await page.waitForTimeout(2000);

    const leadLink = page.locator(`a:has-text("${name}")`);
    await expect(leadLink).toBeVisible({ timeout: 10000 });
    await leadLink.click();
    
    const leadModal = page.locator('#lead-modal');
    await expect(leadModal).toBeVisible({ timeout: 10000 });
    await expect(leadModal.locator('h4, h3, h2, h1').first()).toBeVisible({ timeout: 10000 });

    const customerHelper = new CustomerHelper(page, APP_BASE_URL!);
    ({ clientId, customerAdmin } = await customerHelper.convertToCustomerAndAssignAdmin(name, leadModal));

    try {
      const detailsJson = readAbisExecutionDetails();
      detailsJson.company = { clientId, company, customerAdmin: customerAdmin?.trim() || '' };
      writeAbisExecutionDetails(detailsJson);
    } catch (err) {
      CommonHelper.logger('ERROR', 'Error saving customer details to JSON:', err);
    }
  });

  await test.step('5. Create Service', async () => {
    const serviceHelper = new ServiceHelper(page);
    ({ serviceNumber, serviceName, deadline } = await serviceHelper.createService(proposalNumberHtml || ''));

    try {
      const detailsJson = readAbisExecutionDetails();
      detailsJson.service = { serviceNumber, serviceName, deadline };
      writeAbisExecutionDetails(detailsJson);
    } catch (err) {
      CommonHelper.logger('ERROR', 'Error saving service details to JSON:', err);
    }
  });

  await test.step('6. Create Task', async () => {
    const taskHelper = new TaskHelper(page);
    await taskHelper.createPaymentCollectionTask();
  });

  await test.step('7. Create and Approve PrePayment', async () => {
    const goToCustomerLink = page.locator('a', { hasText: 'Go to Customer' });
    await expect(goToCustomerLink).toBeVisible({ timeout: 10000 });
    await goToCustomerLink.click();

    const prePaymentTab = page.getByRole('link', { name: 'Pre Payment', exact: true });
    await expect(prePaymentTab).toBeVisible({ timeout: 10000 });
    await prePaymentTab.click();

    const newPrePaymentLink = page.getByRole('link', { name: /New Pre Payment/i });
    await expect(newPrePaymentLink).toBeVisible({ timeout: 10000 });
    await newPrePaymentLink.click();

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
    try {
      const prepaymentMatch = (await page.content()).match(/PP-\d+/);
      if (prepaymentMatch) {
        prepaymentNumber = prepaymentMatch[0];
      } else {
        const urlMatch = page.url().match(/credit_notes\/(\d+)/);
        if (urlMatch) {
          const heading = await page.locator('h4, h3, h2').first().textContent().catch(() => '');
          const headingMatch = heading?.match(/PP-\d+/);
          if (headingMatch) prepaymentNumber = headingMatch[0];
        }
      }
    } catch (err) {
      CommonHelper.logger('WARN', 'Could not extract prepayment number:', err);
    }

    // Navigate to prepayment detail page and approve
    if (!page.url().includes('credit_notes/view')) {
      await page.goto(`${APP_BASE_URL}/credit_notes`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
    }

    if (prepaymentNumber) {
      const prepaymentLink = page.locator(`a:has-text("${prepaymentNumber}")`).first();
      await expect(prepaymentLink).toBeVisible({ timeout: 10000 });
      await prepaymentLink.click();
    } else {
      const firstPrepayment = page.locator('table tbody tr').first().locator('a').first();
      await firstPrepayment.click();
    }
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Click More dropdown and Approve
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
              break;
            }
          }
        }
        if (moreDropdownClicked) break;
        await page.waitForTimeout(1000);
      } catch (err) {
        await page.waitForTimeout(1000);
      }
    }

    if (!moreDropdownClicked) throw new Error('More dropdown not found or not clickable');

    const approvePaymentBtn = page.locator('a, button', { hasText: 'Approve Payment' });
    await expect(approvePaymentBtn).toBeVisible({ timeout: 10000 });

    page.once('dialog', async dialog => await dialog.accept());
    await approvePaymentBtn.click();
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle');

    try {
      const detailsJson = readAbisExecutionDetails();
      if (!detailsJson.service) detailsJson.service = {};
      detailsJson.service.prepaymentNumber = prepaymentNumber;
      writeAbisExecutionDetails(detailsJson);
    } catch (err) {
      CommonHelper.logger('ERROR', 'Error saving prepayment to JSON:', err);
    }
  });

  await test.step('8. Create and Accept Proforma', async () => {
    const proformaDetailsJson = readAbisExecutionDetails();
    const clientIdRaw = proformaDetailsJson.company?.clientId || '';
    const proformaClientId = clientIdRaw.replace(/^#/, '');
    if (!proformaClientId) throw new Error('clientId not found in abis_execution_details.json');

    const proformaHelper = new ProformaHelper(page);
    await proformaHelper.createAndAcceptProforma(proformaClientId, APP_BASE_URL!);
  });

  await test.step('9. Convert to Invoice and Record Payment', async () => {
    const invoiceHelper = new InvoiceHelper(page);
    await invoiceHelper.processInvoiceWorkflow();
  });
});

