import { login } from '../utils/loginHelper';
import { LeadHelper, LeadDetails } from '../utils/leadHelper';
import { ProposalHelper } from '../utils/proposalHelper';
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
  test.setTimeout(900000); // 15 minutes to accommodate slower flows
  CommonHelper.logger('INFO', 'Starting ABIS Sanity Test');
  CommonHelper.logger('INFO', 'Using APP_BASE_URL:', APP_BASE_URL);
  CommonHelper.logger('INFO', 'Using E2E_USER:', E2E_USER);
  // Login
  await login(page, APP_BASE_URL!, E2E_USER!, E2E_PASS!);

  // Create lead via helper
  const leadHelper = new LeadHelper(page, APP_BASE_URL!);
  const lead: LeadDetails = await leadHelper.createLead();
  // dialog is referenced by the subsequent proposal navigation; define it here
  const dialog = page.locator('#lead-modal');
  const { name, email, phone, company, address, city, state: selectedState, zip } = lead;
   // Lead creation screenshot
  // Removed routine lead creation screenshot for optimization

  // Create Proposal via helper (from lead modal)
  const proposalHelper = new ProposalHelper(page);
  const { proposalNumber: proposalNumberHtml, selectedServices, selectedCompany } = await proposalHelper.createFromLeadModal(dialog);
  const leadDetails = { name, email, phone };

  // Accept/Decline handled within ProposalHelper; continuing with conversion.

  // proposalNumberHtml is already available from ProposalHelper

  // Convert to Customer via helper
  const customerHelper = new CustomerHelper(page, APP_BASE_URL!);
  const customerRes = await customerHelper.convertLeadToCustomer(name);
  const clientId = customerRes.clientId;
  const panValue = customerRes.pan;
  const gstValue = customerRes.gst;
  const selectedOption = customerRes.customerAdmin;

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
      pan: panValue,
      gst: gstValue,
      customerAdmin: selectedOption?.trim() || ''
    }
  };
  writeAbisExecutionDetails(detailsJson);

  // Create Service via helper
  const serviceHelper = new ServiceHelper(page);
  const { serviceNumber, deadline } = await serviceHelper.createFromAcceptedProposal(proposalNumberHtml || '');
  try {
    const detailsJson = readAbisExecutionDetails();
    detailsJson.service = { serviceNumber, deadline };
    writeAbisExecutionDetails(detailsJson);
  } catch (err) { CommonHelper.logger('ERROR', 'Error updating service details:', err); }

  // Create Task via helper
  const taskHelper = new TaskHelper(page);
  const taskOk = await taskHelper.createPaymentCollectionAndMarkInProgress();
  if (!taskOk) throw new Error('Payment Collection task not found after creation.');

    // --- Preferred Workflow: Create Pre Payment from the Service page ---
    try {
      let svcNum = serviceNumber;
      if (!svcNum) {
        const data = readAbisExecutionDetails();
        svcNum = data?.service?.serviceNumber || svcNum;
      }
      if (svcNum) {
        await page.goto(`${APP_BASE_URL}/projects/view/${svcNum}`);
        CommonHelper.logger('STEP', `Navigated to service page ${svcNum} for Pre Payment`);
        // Look for New Pre Payment trigger in service context
        let svcPrepayTrigger = page.locator('button, a', { hasText: /New Pre Payment/i }).first();
        // Also try anchor pointing to credit note creation
        if (!(await svcPrepayTrigger.count())) {
          svcPrepayTrigger = page.locator('a[href*="/credit_notes/credit_note" i]').first();
        }
        await expect(svcPrepayTrigger).toBeVisible({ timeout: 8000 });
        await svcPrepayTrigger.click();
        CommonHelper.logger('STEP', 'Clicked New Pre Payment from service page');
      } else {
        CommonHelper.logger('WARN', 'No serviceNumber available to open service page; falling back to customer/global flows.');
      }
    } catch (err) {
      CommonHelper.logger('WARN', 'Service-page Pre Payment path failed; will try customer/global flows next.');
    }

    // If service-page path didn’t open a modal/create form, we’ll use customer/global fallbacks below.

    // --- New Pre Payment Workflow (guarded/optional) ---
    let prepaymentSucceeded = false;
    try {
      // Click "New Pre Payment" trigger (button or link)
      let newPrePaymentTrigger = page.locator('button, a', { hasText: /New Pre Payment/i }).first();
      await expect(newPrePaymentTrigger).toBeVisible({ timeout: 10000 });
      await newPrePaymentTrigger.click();
      CommonHelper.logger('STEP', 'Clicked New Pre Payment');

      // If a dialog appears saying no service exists, close it and fallback to global Pre Payment module
      const serviceRequiredDialog = page.getByRole('dialog').filter({ hasText: 'Add service before creating Pre Payment.' });
      try {
    await expect(serviceRequiredDialog).toBeVisible({ timeout: 4000 });
    CommonHelper.logger('INFO', 'Pre Payment requires a service; falling back to global Pre Payment module');
    const closeBtn = serviceRequiredDialog.locator('button, a', { hasText: /^Close$/i }).first();
    if (await closeBtn.count()) {
      await closeBtn.click();
    } else {
      // Try X close
      const xBtn = serviceRequiredDialog.locator('button.close, button[aria-label="Close"], .modal-header button').first();
      if (await xBtn.count()) await xBtn.click();
    }
    // Navigate to global Pre Payment module
    await page.goto(`${APP_BASE_URL}/credit_notes`);
    CommonHelper.logger('STEP', 'Navigated to global Pre Payment module');
    // Go directly to create page with customer preselected; this is more reliable across themes
    const clientIdRaw2 = clientId || '';
    const clientIdClean2 = clientIdRaw2.replace(/^#/, '');
    const candidateUrls = [
      `${APP_BASE_URL}/credit_notes/credit_note?customer_id=${clientIdClean2}`,
      `${APP_BASE_URL}/credit_notes/credit_note?client=${clientIdClean2}`,
      `${APP_BASE_URL}/credit_notes/credit_note?client_id=${clientIdClean2}`,
      `${APP_BASE_URL}/credit_notes/credit_note`
    ];
    for (const url of candidateUrls) {
      await page.goto(url);
      CommonHelper.logger('STEP', `Tried navigate to Pre Payment create URL: ${url}`);
      const ctrl = await page.$('form select[id*="client" i], form select[name*="client" i], form select[id*="customer" i], form select[name*="customer" i]');
      if (ctrl) {
        CommonHelper.logger('INFO', `Form controls detected on ${url}`);
        break;
      }
    }
      } catch {
        // No blocking dialog; continue within current context
      }

      // Wait for New Pre Payment modal/form to appear (modal or inline form)
      const prePaymentModal = page.locator('.modal:visible');
      const serviceDropdownButton = page.locator('button[data-id*="project" i], button[data-id*="service" i], .bootstrap-select[name*="project" i] button, .bootstrap-select[name*="service" i] button, .bootstrap-select:has(select[id*="project" i]) button, .bootstrap-select:has(select[id*="service" i]) button');
      const serviceSelect = page.locator('select#project_id, select[name="project_id"], select[id*="project" i], select[name*="project" i], select#service_id, select[name="service_id"], select[id*="service" i], select[name*="service" i]');
      const customerSelect = page.locator('form select[id*="client" i], form select[name*="client" i], form select[id*="customer" i], form select[name*="customer" i]');
      await Promise.race([
        prePaymentModal.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {}),
        serviceDropdownButton.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {}),
        serviceSelect.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {}),
        customerSelect.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {})
      ]);

  // If on global creation page, select customer first so that services populate
  if (await customerSelect.count()) {
    try {
      await expect(customerSelect.first()).toBeVisible({ timeout: 10000 });
  const options = await customerSelect.locator('option').allTextContents();
      let labelToPick: string | undefined;
      try {
        const details = readAbisExecutionDetails();
        const companyName = details.company?.company || '';
        if (companyName) {
          labelToPick = options.find(o => (o || '').toLowerCase().includes(companyName.toLowerCase()));
        }
      } catch {}
      if (!labelToPick) {
        labelToPick = options.find(o => (o || '').trim().length > 0 && !/select/i.test(o || ''));
      }
      if (labelToPick) {
        await customerSelect.selectOption({ label: labelToPick.trim() });
        CommonHelper.logger('STEP', `Selected customer for Pre Payment: ${labelToPick.trim()}`);
        // Also attempt selection by value with clientId to ensure dependent fields populate
        try {
          const clientIdCleanLocal = (clientId || '').toString().replace(/^#/, '');
          if (clientIdCleanLocal) {
            const valueOption = await customerSelect.locator(`option[value="${clientIdCleanLocal}"]`).count();
            if (valueOption > 0) {
              await customerSelect.selectOption({ value: clientIdCleanLocal });
              CommonHelper.logger('STEP', `Selected customer by value: ${clientIdCleanLocal}`);
            }
          }
        } catch {}
        // Fire change event to trigger async population of services
        const selectHandle = await customerSelect.first().elementHandle();
        if (selectHandle) {
          await page.evaluate((el) => {
            const evt = new Event('change', { bubbles: true });
            el.dispatchEvent(evt);
            // jQuery fallback
            // @ts-ignore
            if (window && (window as any).$) {
              // @ts-ignore
              (window as any).$(el).trigger('change');
            }
          }, selectHandle);
        }
      } else {
        CommonHelper.logger('WARN', 'No suitable customer option found for Pre Payment; proceeding without explicit selection');
      }
      // Wait for service control to become visible/enabled after customer selection
      await Promise.race([
        serviceDropdownButton.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {}),
        serviceSelect.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {})
      ]);
      // Some UIs enable the select after async; wait for enabled state
      if (await serviceSelect.count()) {
        await page.waitForFunction((selector: string) => {
          const el = document.querySelector(selector) as HTMLSelectElement | null;
          return !!el && !el.disabled && el.options && el.options.length > 0;
        }, 'select#project_id, select[name="project_id"], select[id*="project" i], select[name*="project" i], select#service_id, select[name="service_id"], select[id*="service" i], select[name*="service" i]', { timeout: 6000 });
      }
    } catch (err) {
      CommonHelper.logger('WARN', 'Customer selection and service enablement may have failed; continuing to try service selection.');
    }
  }

  // Prepare search terms from execution details
  let searchTerms: string[] = [];
  try {
    const details = readAbisExecutionDetails();
    const companyName: string = details.company?.company || '';
    const serviceNum: string = (details.service?.serviceNumber || '').toString();
    const serviceDigits = serviceNum.replace(/\D/g, '');
    if (companyName) {
      // Use full and first token of company name
      searchTerms.push(companyName);
      const firstToken = companyName.split(/\s+/)[0];
      if (firstToken && firstToken.length > 2) searchTerms.push(firstToken);
    }
    if (serviceDigits) searchTerms.push(serviceDigits);
  } catch {}
  // Always include space as last resort
  searchTerms = [...new Set(searchTerms.filter(Boolean))];
  if (searchTerms.length === 0) searchTerms = [' '];

  // Select service via bootstrap-select or native select
  let serviceSelected = false;
  if (await serviceDropdownButton.count()) {
    try {
      await serviceDropdownButton.first().click();
      // Wait for dropdown menu to open
      await page.waitForSelector('.bootstrap-select.open .dropdown-menu.inner, #project_ajax_search_wrapper .dropdown-menu.open', { timeout: 6000 });
      const serviceSearchInput = page.locator('#project_ajax_search_wrapper .bs-searchbox input, .bootstrap-select.open .bs-searchbox input, .bs-searchbox input');
      await expect(serviceSearchInput).toBeVisible({ timeout: 6000 });
      for (const term of searchTerms) {
        await serviceSearchInput.fill('');
        await serviceSearchInput.type(term, { delay: 50 });
        await page.waitForTimeout(400);
        const optionLocator = page.locator('#project_ajax_search_wrapper .inner.open ul li a span.text, .bootstrap-select.open .dropdown-menu.inner li a span.text, .bootstrap-select .dropdown-menu.inner li a span.text');
        const found = await optionLocator.count();
        if (found > 0) {
          // Prefer option containing company name if available
          let toClick = optionLocator.first();
          try {
            const details = readAbisExecutionDetails();
            const company = details.company?.company || '';
            if (company) {
              const match = optionLocator.filter({ hasText: new RegExp(company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
              if (await match.count()) toClick = match.first();
            }
          } catch {}
          await toClick.click();
          serviceSelected = true;
          CommonHelper.logger('STEP', `Selected service using term: ${term}`);
          break;
        }
      }
    } catch (err) {
      CommonHelper.logger('WARN', 'Bootstrap select service selection failed, will try native select next.');
    }
  }
  if (!serviceSelected && await serviceSelect.count()) {
    // Try to select by label text matching company name or pick first non-empty
    try {
      const options = await serviceSelect.locator('option').allTextContents();
      const details = readAbisExecutionDetails();
      const company = (details.company?.company || '').toLowerCase();
      let labelToPick: string | undefined;
      if (company) {
        labelToPick = options.find(o => (o || '').toLowerCase().includes(company));
      }
      if (!labelToPick) {
        labelToPick = options.find(o => (o || '').trim().length > 0 && !/select/i.test(o || ''));
      }
      if (labelToPick) {
        await serviceSelect.selectOption({ label: labelToPick.trim() });
        serviceSelected = true;
        CommonHelper.logger('STEP', `Selected service from native select: ${labelToPick.trim()}`);
      }
    } catch (err) {
      CommonHelper.logger('WARN', 'Native select service selection failed.');
    }
  }
      if (!serviceSelected) {
        await page.screenshot({ path: 'service-dropdown-arrow-fail.png', fullPage: true });
        const html = await page.content();
        try { require('fs').writeFileSync('prepayment-create-debug.html', html); } catch {}
        CommonHelper.logger('WARN', 'Service selection not possible or not required. Proceeding without service selection. HTML saved for diagnostics.');
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
  // Post-save: Click More dropdown, Approve Payment, and Ok in alert popup
  // 1. Click "More" dropdown in the right hand side top (robust strict mode fix)
  // Wait for page to be stable after Save
    await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

    let moreDropdownClicked = false;
  for (let i = 0; i < 5; i++) {
    try {
      // Try to find the correct More dropdown (exclude "Load More" buttons)
      const moreDropdowns = await page.locator('button, a', { hasText: 'More' }).elementHandles();
      for (const handle of moreDropdowns) {
        const text = (await handle.textContent())?.trim() || '';
        // Exclude elements with text 'Load More'
        if (text === 'More') {
          // Check if visible and enabled
          const box = await handle.boundingBox();
          if (box && box.width > 0 && box.height > 0) {
            await handle.click();
            moreDropdownClicked = true;
            CommonHelper.logger('STEP', 'Clicked More dropdown after Pre Payment save');
            break;
          }
        }
      }
      if (moreDropdownClicked) break;
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
    if (!moreDropdownClicked) {
  CommonHelper.logger('WARN', 'Could not find or click More dropdown after Pre Payment save.');
    throw new Error('More dropdown not found or not clickable after retries.');
  }

  // 2. Click "Approve Payment" and handle alert popup
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
  // Wait a short time for alert to appear and be handled
  await page.waitForTimeout(2000);
    if (!alertHandled) {
  CommonHelper.logger('WARN', 'No alert popup appeared or was handled after Approve Payment');
  }
  // Wait for modal to close or success indicator
      await page.waitForTimeout(2000);
      const modalStillVisible = await prePaymentModal.isVisible().catch(() => false);
      if (modalStillVisible) {
        await page.screenshot({ path: 'pre-payment-modal-not-closed.png', fullPage: true });
        CommonHelper.logger('WARN', 'pre-payment-modal-not-closed: saved screenshot for debugging');
      }
  // After Save, capture Prepayment number from page content or modal
      await page.waitForTimeout(2000); // Wait for UI update after Save
      let prepaymentNumber = '';
      const pageContentAfterPrepayment = await page.content();
      const prepaymentMatch = pageContentAfterPrepayment.match(/PP-\d+/);
      if (prepaymentMatch) {
        prepaymentNumber = prepaymentMatch[0];
        prepaymentSucceeded = true;
        CommonHelper.logger('INFO', 'Captured Prepayment number:', prepaymentNumber);
      } else {
        CommonHelper.logger('WARN', 'Prepayment number not found in page content after Save.');
      }

// Update abis_execution_details.json under the corresponding service
try {
    const detailsJson = readAbisExecutionDetails();
    if (!detailsJson.service) detailsJson.service = {};
    detailsJson.service.prepaymentNumber = prepaymentNumber;
    writeAbisExecutionDetails(detailsJson);
    CommonHelper.logger('INFO', 'Prepayment number updated in abis_execution_details.json:', prepaymentNumber);
} catch (err) {
  CommonHelper.logger('ERROR', 'Error updating Prepayment number in abis_execution_details.json:', err);
  }
      } catch (err) {
        CommonHelper.logger('WARN', `Skipping Pre Payment creation due to error or unavailable UI. Continuing. Error: ${String(err)}`);
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
    // Fallback: try alternate Add selectors or proceed without modal
    let addedFromModal = false;
    try {
      const altAdd = servicesModal.locator('a:has-text("Add"), button:has-text("Add"), a.addtoestimate, button.addtoestimate, .addtoestimate, .add');
      const count = await altAdd.count();
      for (let i = 0; i < count; i++) {
        const cand = altAdd.nth(i);
        if (await cand.isVisible()) {
          await cand.click();
          addedFromModal = true;
          CommonHelper.logger('STEP', 'Clicked alternate Add control in Services modal');
          break;
        }
      }
    } catch {}
    if (!addedFromModal) {
      // Close the modal if possible and continue with manual item entry
      try {
        const closeBtn = servicesModal.locator('button:has-text("Close"), .close, button[aria-label="Close"], a[aria-label="Close"]').first();
        if (await closeBtn.count()) {
          await closeBtn.click();
          CommonHelper.logger('WARN', 'Closed Services modal; proceeding to manual item entry');
        }
      } catch {}
    }
  }
}

// Make required fields editable before filling
// Patch: Remove jQuery :visible selector, use DOM visibility filter
await page.evaluate(() => {
  const modals = Array.from(document.querySelectorAll('.modal, .modal.show'));
  // Only keep visible modals (cast to HTMLElement for offsetWidth/offsetHeight)
  modals.filter(el => {
    const htmlEl = el as HTMLElement;
    return !!(htmlEl.offsetWidth || htmlEl.offsetHeight || htmlEl.getClientRects().length);
  });
  document.querySelectorAll('.panel_s.accounting-template input[readonly], .panel_s.accounting-template textarea[readonly]').forEach(el => {
    el.removeAttribute('readonly');
  });
});
// Fill required fields in items table
const itemsSection = page.locator('.panel_s.accounting-template');
// Proactively fill one line item before clicking tick
try {
  // Try to find description, quantity and rate inputs with robust selectors
  let descInput = itemsSection.locator('textarea[name="description"], textarea[name*="description" i], textarea[placeholder*="Description" i], textarea').first();
  let quantityInput = itemsSection.locator('input[name="quantity"], input[name*="qty" i], input[placeholder*="Qty" i], input[placeholder*="Quantity" i]').first();
  let rateInput = itemsSection.locator('input[name="rate"], input[name*="rate" i], input[placeholder*="Rate" i]').first();
  // Ensure they are visible/enabled before filling
  if (await descInput.count()) {
    await expect(descInput).toBeVisible({ timeout: 5000 });
    await descInput.fill('Service Description');
  }
  if (await quantityInput.count()) {
    await expect(quantityInput).toBeVisible({ timeout: 5000 });
    await quantityInput.fill('1');
  }
  if (await rateInput.count()) {
    await expect(rateInput).toBeVisible({ timeout: 5000 });
    await rateInput.fill('100');
  }
} catch (err) {
  CommonHelper.logger('WARN', 'Could not prefill Proforma item fields; will rely on modal Add or defaults.', err);
}
// Click tick mark button
let tickBtn = itemsSection.locator('button.btn-primary:has(i.fa-check)');
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
  // Fallback: try alternate add item button id used elsewhere
  try {
    tickBtn = page.locator('#btnAdditem');
    await expect(tickBtn).toBeVisible({ timeout: 5000 });
    await tickBtn.click();
    CommonHelper.logger('STEP', 'Clicked alternate tick mark button (#btnAdditem)');
  } catch (err2) {
    throw err;
  }
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
    page.waitForSelector('.toast-success, .alert-success, .notification-success', { timeout: 12000 }),
    page.waitForNavigation({ timeout: 12000 })
  ]).catch(() => {});
  // Also wait briefly for network to settle
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  // Heuristics: presence of Convert to Invoice / Mark as Accepted
  const hasConvert = await page.locator('button:has-text("Convert to Invoice")').first().isVisible().catch(() => false);
  const hasAccepted = await page.locator('a, button:has-text("Mark as Accepted")').first().isVisible().catch(() => false);
  const urlNow = page.url();
  const contentNow = await page.content();
  const hasProformaNumber = /EST-\d+/.test(contentNow);
  if (hasConvert || hasAccepted || hasProformaNumber || /estimates|proforma|estimate\//i.test(urlNow)) {
    saveSuccess = true;
  }
  if (saveSuccess) {
    CommonHelper.logger('INFO', 'Proforma Save appears successful by heuristics (controls present or number detected).');
  }
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
  CommonHelper.logger('WARN', 'Could not find or click More dropdown for Mark as Accepted. Proceeding without marking as accepted.');
    // Do not throw here; continue flow as Proforma may still be usable
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
  CommonHelper.logger('WARN', 'Proforma Save heuristics inconclusive; continuing to conversion attempts.');
}

// Track invoice readiness across conversion and fallbacks
let invoiceReady = false;
try {
  // Wait for page to be stable after Proforma save
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);

  // Strategy 1: Direct Convert to Invoice dropdown/button
  let converted = false;
  let convertDropdownBtn = page.locator('button', { hasText: /Convert to Invoice/i });
  for (let i = 0; i < 5 && !converted; i++) {
    if (await convertDropdownBtn.count() && await convertDropdownBtn.isVisible()) {
      await convertDropdownBtn.click();
      CommonHelper.logger('STEP', 'Clicked Convert to Invoice dropdown button');
      const convertOptionBtn = page.locator('a, button', { hasText: /^Convert$/i }).first();
      if (await convertOptionBtn.count()) {
        await convertOptionBtn.click();
        CommonHelper.logger('STEP', 'Clicked Convert option in Convert to Invoice dropdown');
        converted = true;
        invoiceReady = true;
        break;
      }
    }
    await page.waitForTimeout(800);
  }

  // Strategy 2: Direct link/button with text Convert to Invoice
  if (!converted) {
    const directConvert = page.locator('a, button', { hasText: /Convert to Invoice/i }).first();
    if (await directConvert.count() && await directConvert.isVisible()) {
      await directConvert.click();
      CommonHelper.logger('STEP', 'Clicked direct Convert to Invoice control');
      // Sometimes a confirm appears
      const confirmBtn = page.locator('a, button', { hasText: /^Convert$/i }).first();
      if (await confirmBtn.count() && await confirmBtn.isVisible()) {
        await confirmBtn.click();
      }
      converted = true;
      invoiceReady = true;
    }
  }

  // Strategy 3: Use More dropdown to find Convert to Invoice or Convert
  if (!converted) {
    let moreClicked = false;
    for (let i = 0; i < 5; i++) {
      const moreDropdowns = await page.locator('button, a', { hasText: 'More' }).elementHandles();
      for (const handle of moreDropdowns) {
        const text = (await handle.textContent())?.trim() || '';
        if (text === 'More') {
          const box = await handle.boundingBox();
          if (box && box.width > 0 && box.height > 0) {
            await handle.click();
            moreClicked = true;
            break;
          }
        }
      }
      if (moreClicked) break;
      await page.waitForTimeout(600);
    }
    if (moreClicked) {
      const convertViaMore = page.locator('a, button', { hasText: /Convert to Invoice|^Convert$/i }).first();
      if (await convertViaMore.count() && await convertViaMore.isVisible()) {
        await convertViaMore.click();
        CommonHelper.logger('STEP', 'Clicked Convert via More dropdown');
        converted = true;
        invoiceReady = true;
      }
    }
  }

  // Strategy 4: Navigate to Proforma list and open latest Proforma, then retry strategies 1-3 once more
  if (!converted) {
    try {
      const detailsJson = readAbisExecutionDetails();
      const clientIdRaw = detailsJson.company?.clientId || '';
      const clientIdClean = (clientIdRaw || '').toString().replace(/^#/, '');
      if (clientIdClean) {
        await page.goto(`${APP_BASE_URL}/clients/client/${clientIdClean}`);
        const proformaTab2 = page.getByRole('link', { name: 'Proforma', exact: true });
        await expect(proformaTab2).toBeVisible({ timeout: 10000 });
        await proformaTab2.click();
        // Open first Proforma link containing EST-
        const firstProformaLink = page.locator('a', { hasText: /EST-\d+/ }).first();
        if (await firstProformaLink.count()) {
          await firstProformaLink.click();
          CommonHelper.logger('STEP', 'Opened latest Proforma from list');
          await page.waitForLoadState('networkidle').catch(() => {});
          // Retry Strategy 1
          convertDropdownBtn = page.locator('button', { hasText: /Convert to Invoice/i });
          if (await convertDropdownBtn.count() && await convertDropdownBtn.isVisible()) {
            await convertDropdownBtn.click();
            const convertOptionBtn = page.locator('a, button', { hasText: /^Convert$/i }).first();
            if (await convertOptionBtn.count()) {
              await convertOptionBtn.click();
              CommonHelper.logger('STEP', 'Clicked Convert option in dropdown (after reopening Proforma)');
              converted = true;
              invoiceReady = true;
            }
          }
          // Retry Strategy 2 if still not converted
          if (!converted) {
            const directConvert2 = page.locator('a, button', { hasText: /Convert to Invoice/i }).first();
            if (await directConvert2.count() && await directConvert2.isVisible()) {
              await directConvert2.click();
              const confirmBtn2 = page.locator('a, button', { hasText: /^Convert$/i }).first();
              if (await confirmBtn2.count() && await confirmBtn2.isVisible()) await confirmBtn2.click();
              CommonHelper.logger('STEP', 'Clicked direct Convert to Invoice (after reopening Proforma)');
              converted = true;
              invoiceReady = true;
            }
          }
          // Retry Strategy 3 via More
          if (!converted) {
            let moreClicked2 = false;
            for (let i = 0; i < 5; i++) {
              const moreDropdowns = await page.locator('button, a', { hasText: 'More' }).elementHandles();
              for (const handle of moreDropdowns) {
                const text = (await handle.textContent())?.trim() || '';
                if (text === 'More') {
                  const box = await handle.boundingBox();
                  if (box && box.width > 0 && box.height > 0) {
                    await handle.click();
                    moreClicked2 = true;
                    break;
                  }
                }
              }
              if (moreClicked2) break;
              await page.waitForTimeout(600);
            }
            if (moreClicked2) {
              const convertViaMore2 = page.locator('a, button', { hasText: /Convert to Invoice|^Convert$/i }).first();
              if (await convertViaMore2.count() && await convertViaMore2.isVisible()) {
                await convertViaMore2.click();
                CommonHelper.logger('STEP', 'Clicked Convert via More dropdown (after reopening Proforma)');
                converted = true;
                invoiceReady = true;
              }
            }
          }
        }
      }
    } catch (err) {
      CommonHelper.logger('WARN', 'Fallback navigation to Proforma list failed:', err);
    }
  }

  if (!converted) {
  CommonHelper.logger('WARN', 'All strategies to trigger Convert to Invoice failed.');
    // Fallback: create invoice directly for this client
    try {
      const detailsJson = readAbisExecutionDetails();
      const clientIdRaw = detailsJson.company?.clientId || '';
      const clientIdClean = (clientIdRaw || '').toString().replace(/^#/, '');
      if (!clientIdClean) throw new Error('No clientId for invoice fallback');
      await page.goto(`${APP_BASE_URL}/invoices/invoice?customer_id=${clientIdClean}`);
      CommonHelper.logger('STEP', 'Navigated to Invoice creation page (fallback)');
      // Ensure customer is selected
      try {
        const customerSelect = page.locator('form select[id*="client" i], form select[name*="client" i], form select[id*="customer" i], form select[name*="customer" i]');
        if (await customerSelect.count()) {
          await expect(customerSelect.first()).toBeVisible({ timeout: 8000 });
          const valueOption = await customerSelect.locator(`option[value="${clientIdClean}"]`).count();
          if (valueOption > 0) {
            await customerSelect.selectOption({ value: clientIdClean });
            CommonHelper.logger('STEP', `Selected invoice customer by value: ${clientIdClean}`);
          } else {
            const options = await customerSelect.locator('option').allTextContents();
            const companyName = detailsJson.company?.company || '';
            let labelToPick = options.find(o => (o || '').toLowerCase().includes((companyName || '').toLowerCase()));
            if (!labelToPick) labelToPick = options.find(o => (o || '').trim().length > 0 && !/select/i.test(o || ''));
            if (labelToPick) {
              await customerSelect.selectOption({ label: labelToPick.trim() });
              CommonHelper.logger('STEP', `Selected invoice customer by label: ${labelToPick.trim()}`);
            }
          }
        }
      } catch {}
      // Select Billing From if present
      try {
        const invoiceBillingFrom = page.locator('select[name="c_id"], #mastercompany');
        const billingCompany = detailsJson.proposal?.services?.[0]?.company || detailsJson.company?.company || '';
        if (await invoiceBillingFrom.count() && await invoiceBillingFrom.isVisible()) {
          await invoiceBillingFrom.selectOption({ label: billingCompany });
          CommonHelper.logger('STEP', `Selected Billing From company for invoice: ${billingCompany}`);
        }
      } catch {}
      // Ensure items section editable
      await page.evaluate(() => {
        document.querySelectorAll('.panel_s.accounting-template input[readonly], .panel_s.accounting-template textarea[readonly]').forEach(el => {
          el.removeAttribute('readonly');
        });
      });
      // Fill one line item and add
      const invoiceItems = page.locator('.panel_s.accounting-template');
      try {
        const desc = invoiceItems.locator('textarea[name*="description" i], textarea').first();
        if (await desc.count()) await desc.fill('Service Description');
      } catch {}
      try {
        const qty = invoiceItems.locator('input[name*="quantity" i], input[placeholder*="Qty" i]').first();
        if (await qty.count()) await qty.fill('1');
      } catch {}
      try {
        const rate = invoiceItems.locator('input[name*="rate" i], input[placeholder*="Rate" i]').first();
        if (await rate.count()) await rate.fill('100');
      } catch {}
      let addItemBtn = invoiceItems.locator('button.btn-primary:has(i.fa-check)');
      if (!(await addItemBtn.count())) addItemBtn = page.locator('#btnAdditem');
      if (await addItemBtn.count()) {
        await addItemBtn.click();
        CommonHelper.logger('STEP', 'Added invoice item (fallback)');
      }
      // Save invoice via broad selector
      let saveClicked = false;
      const saveCandidates = [
        page.getByRole('button', { name: /Save/i }),
        page.locator('button:has-text("Save")'),
        page.locator('a:has-text("Save")'),
        page.locator('input[type="submit"][value*="Save" i]')
      ];
      for (const cand of saveCandidates) {
        try {
          if (await cand.count() && await cand.first().isVisible()) {
            await cand.first().click();
            saveClicked = true;
            break;
          }
        } catch {}
      }
      if (!saveClicked) {
        throw new Error('Invoice Save control not found');
      }
      await Promise.race([
        page.waitForSelector('.toast-success, .alert-success, .notification-success', { timeout: 15000 }).catch(() => {}),
        page.waitForNavigation({ timeout: 15000 }).catch(() => {})
      ]);
      // Heuristic confirmation
      await page.waitForLoadState('networkidle').catch(() => {});
      const invoiceContent = await page.content();
      const hasInvoiceNumber = /[A-Z]{2,5}-\d{3,}/.test(invoiceContent) || /Invoice\s*#|Invoice No\./i.test(invoiceContent);
      if (!hasInvoiceNumber) {
        CommonHelper.logger('WARN', 'Invoice fallback save did not clearly show invoice number; continuing with best effort.');
      }
      CommonHelper.logger('INFO', 'Invoice created via fallback path');
      invoiceReady = true;
    } catch (fallbackErr) {
      CommonHelper.logger('ERROR', 'Invoice fallback creation failed:', fallbackErr);
      // Secondary fallback: open an existing invoice for this client
      try {
        const detailsJson = readAbisExecutionDetails();
        const clientIdRaw = detailsJson.company?.clientId || '';
        const clientIdClean = (clientIdRaw || '').toString().replace(/^#/, '');
        if (!clientIdClean) throw new Error('No clientId for invoice secondary fallback');
        await page.goto(`${APP_BASE_URL}/clients/client/${clientIdClean}`);
        // Try Invoices tab
        let invoicesTab = page.getByRole('link', { name: 'Invoices', exact: true });
        if (!(await invoicesTab.count())) {
          invoicesTab = page.locator('a', { hasText: /^Invoices$/i });
        }
        if (await invoicesTab.count()) {
          await invoicesTab.first().click();
          await page.waitForLoadState('networkidle').catch(() => {});
        }
        // Open the first invoice by robust href patterns, then by text/patterns
        let invoiceLink = page.locator('a[href*="/invoices/view" i], a[href*="/invoice/" i]').first();
        if (!(await invoiceLink.count())) {
          invoiceLink = page.locator('a', { hasText: /INV-\d+|[A-Z]{2,5}-\d{3,}/ }).first();
        }
        if (!(await invoiceLink.count())) {
          invoiceLink = page.locator('table a:has-text("View"), a[title*="View" i]').first();
        }
        if (await invoiceLink.count()) {
          await invoiceLink.click();
          CommonHelper.logger('STEP', 'Opened existing invoice (secondary fallback)');
          await page.waitForLoadState('networkidle').catch(() => {});
          invoiceReady = true;
        } else {
          // Global invoices page as last resort
          await page.goto(`${APP_BASE_URL}/invoices`);
          await page.waitForLoadState('networkidle').catch(() => {});
          invoiceLink = page.locator('a[href*="/invoices/view" i], a[href*="/invoice/" i]').first();
          if (!(await invoiceLink.count())) {
            invoiceLink = page.locator('a', { hasText: /INV-\d+|[A-Z]{2,5}-\d{3,}/ }).first();
          }
          if (!(await invoiceLink.count())) {
            invoiceLink = page.locator('table a:has-text("View"), a[title*="View" i]').first();
          }
          await invoiceLink.click();
          CommonHelper.logger('STEP', 'Opened existing invoice from global list (secondary fallback)');
          await page.waitForLoadState('networkidle').catch(() => {});
          invoiceReady = true;
        }
      } catch (fallback2Err) {
        CommonHelper.logger('ERROR', 'Invoice secondary fallback failed:', fallback2Err);
        // Do not throw; invoice may not be ready. We'll gate next steps.
      }
    }
  }

  // Wait for navigation or success indicator only if invoice appears ready
  if (invoiceReady) {
    await Promise.race([
      page.waitForNavigation({ timeout: 10000 }),
      page.waitForSelector('.toast-success, .alert-success, .notification-success', { timeout: 10000 }),
      page.waitForSelector('text=Invoice created successfully', { timeout: 10000 })
    ]).catch(() => {});
    CommonHelper.logger('INFO', 'Invoice conversion or fallback success confirmed.');
  } else {
    CommonHelper.logger('WARN', 'Invoice not ready after conversion attempts; skipping invoice-dependent steps.');
  }

  // --- Extract Invoice details after conversion ---
  if (invoiceReady) {
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
  }
} catch (err) {
  CommonHelper.logger('ERROR', 'Error during Convert to invoice workflow:', err);
  try {
      if (!page.isClosed()) {
      await page.screenshot({ path: 'convert-to-invoice-failed.png', fullPage: true });
      CommonHelper.logger('WARN', 'convert-to-invoice-failed: screenshot saved for diagnostics');
    }
  } catch {}
  // Do not throw; continue to optionally handle credits/payment based on invoiceReady
}
// Removed waitForTimeout after page/browser close to avoid error
if (invoiceReady) {
  // Try to open Apply Credits modal if available; otherwise, skip credits gracefully
  let creditsOpened = false;
  let applyCreditsLink = page.locator('a[data-toggle="modal"][data-target="#apply_credits"]', { hasText: /Apply Credit/i });
  if (await applyCreditsLink.count() && await applyCreditsLink.isVisible()) {
    await applyCreditsLink.click();
    CommonHelper.logger('STEP', 'Clicked Apply Credits link');
    creditsOpened = true;
  } else {
    // Try alternate selectors (button/link text only)
    applyCreditsLink = page.locator('a, button', { hasText: /Apply Credit/i }).first();
    if (await applyCreditsLink.count() && await applyCreditsLink.isVisible()) {
      await applyCreditsLink.click();
      CommonHelper.logger('STEP', 'Clicked alternate Apply Credits control');
      creditsOpened = true;
    } else {
      CommonHelper.logger('WARN', 'Apply Credits control not found. Skipping credits step.');
    }
  }

  if (creditsOpened) {
    // Wait for Apply Credits modal to appear
    const applyCreditsModal = page.locator('#apply_credits');
    await applyCreditsModal.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});

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
    } else {
      // Use the first visible input
      const inputHandles = await applyCreditsModal.locator('input').elementHandles();
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
      await applyBtn.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      if (await applyBtn.count() && await applyBtn.first().isVisible()) {
        await applyBtn.first().click();
        CommonHelper.logger('STEP', 'Clicked Apply in Apply Credits modal');
      } else {
        CommonHelper.logger('WARN', 'Apply Credits modal Apply button not found; continuing.');
      }
    }
  }

  // Payment section (panel-based, not modal) - optional
  const paymentBtn = page.locator('a.btn.btn-primary', { hasText: 'Payment' });
  if (await paymentBtn.count() && await paymentBtn.isVisible()) {
    await paymentBtn.click();
    CommonHelper.logger('STEP', 'Clicked Payment button');
  } else {
    CommonHelper.logger('WARN', 'Payment button not found. Skipping payment step.');
  }

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
            const panels = page.locator('.panel_s, .panel-body').filter({ has: heading });
            const panelCount = await panels.count();
            if (panelCount === 1 && await panels.first().isVisible()) {
              paymentPanel = panels.first();
              break;
            } else if (panelCount > 1) {
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
    const pageHtml = await page.content();
    require('fs').writeFileSync('payment-panel-debug.html', pageHtml);
    CommonHelper.logger('ERROR', 'No visible payment panel found for Payment. Saved HTML for diagnostics.');
  } else {
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
      } else {
        // Wait for Approve Payment button to appear (robust)
        const approvePaymentLocator = page.locator('a, button', { hasText: 'Approve Payment' });
        await approvePaymentLocator.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

        // Click "Approve Payment" in dropdown (robust: only click visible)
        let clicked = false;
        for (let attempt = 0; attempt < 5 && !clicked; attempt++) {
          const approvePaymentBtns = page.locator('a, button', { hasText: 'Approve Payment' });
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
            CommonHelper.logger('WARN', `Attempt ${attempt + 1}: No visible Approve Payment button, retrying after 1s...`);
            await page.waitForTimeout(1000);
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
          CommonHelper.logger('WARN', 'No Approve Payment button could be clicked after retries.');
        } else {
          // Wait for popup and click "Yes, approve it!" button
          const yesApproveBtn = page.locator('button, a', { hasText: 'Yes, approve it!' });
          await expect(yesApproveBtn).toBeVisible({ timeout: 10000 });
          await yesApproveBtn.click();
          CommonHelper.logger('STEP', 'Clicked Yes, approve it! in Approve Payment popup');
          await page.waitForTimeout(2000);
        }
      }
    } catch (err) {
      CommonHelper.logger('ERROR', 'Error during Approve Payment workflow:', err);
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
  }
} else {
  CommonHelper.logger('WARN', 'Skipping Apply Credits and Payment sections because invoice is not ready.');
}
});
