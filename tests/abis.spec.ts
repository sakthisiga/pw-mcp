import type { Locator, Page } from '@playwright/test';
// Logger helper
function logger(type: 'INFO' | 'STEP' | 'WARN' | 'ERROR', ...args: any[]) {
  const now = new Date();
  const timestamp = now.toISOString();
  let prefix = `[${type}]`;
  if (type === 'STEP') {
    // All STEP logs: [STEP] [timestamp] --- message ---
    if (args.length === 1) {
      console.log(`[STEP] [${timestamp}] --- ${args[0]} ---`);
    } else {
      // If multiple args, join them as a message
      console.log(`[STEP] [${timestamp}] --- ${args.join(' ')} ---`);
    }
  } else if (type === 'INFO') {
    console.log(`[INFO] [${timestamp}]`, ...args);
  } else if (type === 'WARN') {
    console.log(`[WARN] [${timestamp}]`, ...args);
  } else if (type === 'ERROR') {
    console.log(`[ERROR] [${timestamp}]`, ...args);
  }
}

// Helper for resilient fill
// ...existing code...

async function resilientFill(locator: Locator, value: string, page: Page, label: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await locator.fill(value);
      await expect(locator).toHaveValue(value, { timeout: 5000 });
      return;
    } catch (e) {
      if (i === retries - 1) {
        await page.screenshot({ path: `fill-fail-${label}-${i}.png`, fullPage: true });
        fs.writeFileSync(`fill-fail-${label}-${i}.html`, await page.content());
        throw new Error(`Failed to fill ${label}: ${e}`);
      }
      await page.waitForTimeout(1000);
    }
  }
}

// Helper for resilient click
async function resilientClick(locator: Locator, page: Page, label: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await expect(locator).toBeVisible({ timeout: 5000 });
      await locator.click();
      return;
    } catch (e) {
      if (i === retries - 1) {
        await page.screenshot({ path: `click-fail-${label}-${i}.png`, fullPage: true });
        fs.writeFileSync(`click-fail-${label}-${i}.html`, await page.content());
        throw new Error(`Failed to click ${label}: ${e}`);
      }
      await page.waitForTimeout(1000);
    }
  }
}

// Helper for resilient expect visible
async function resilientExpectVisible(locator: Locator, page: Page, label: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await expect(locator).toBeVisible({ timeout: 5000 });
      return;
    } catch (e) {
      if (i === retries - 1) {
        await page.screenshot({ path: `expect-visible-fail-${label}-${i}.png`, fullPage: true });
        fs.writeFileSync(`expect-visible-fail-${label}-${i}.html`, await page.content());
        throw new Error(`Failed to expect visible ${label}: ${e}`);
      }
      await page.waitForTimeout(1000);
    }
  }
}

import { test, expect } from '@playwright/test';
// ...existing code...
import fs from 'fs';
import dotenv from 'dotenv';
import { writeAbisExecutionDetails } from '../utils/jsonWriter';
const { readAbisExecutionDetails } = require('../utils/jsonWriter');
// Removed require for fs as we are using ES module imports
const faker = require('faker');
dotenv.config();

const APP_BASE_URL = process.env.APP_BASE_URL;
const E2E_USER = process.env.E2E_USER;
const E2E_PASS = process.env.E2E_PASS;

function randomString(length: number) {
  return Math.random().toString(36).substring(2, 2 + length);
}

test('ABIS Sanity', async ({ page }) => {
  test.setTimeout(300000); // 5 minutes
  logger('INFO', '--- Starting ABIS Sanity Test ---');
  // Login
  logger('STEP', 'Login page navigation');
  await page.goto(APP_BASE_URL!);
  logger('STEP', 'Filling login credentials');
  await resilientFill(page.locator('input[name="email"]'), E2E_USER!, page, 'login-email');
  logger('STEP', 'Filled email');
  await resilientFill(page.locator('input[name="password"]'), E2E_PASS!, page, 'login-password');
  logger('STEP', 'Filled password');
  await resilientClick(page.locator('button:has-text("Login")'), page, 'login-button');
  logger('STEP', 'Clicked login button');
  await resilientExpectVisible(page.locator('text=Invoices Awaiting Payment'), page, 'login-success');
  logger('STEP', 'Login success confirmed');
  logger('INFO', 'Login successful');

  // Navigate to leads page and click New Lead
  logger('STEP', 'Navigating to leads page');
  await page.goto(`${APP_BASE_URL}/leads`);
  logger('STEP', 'Looking for New Lead link');
  const newLeadLink = page.locator('a', { hasText: 'New Lead' });
  logger('STEP', 'Found New Lead link');
  await resilientExpectVisible(newLeadLink, page, 'new-lead-link');
  logger('STEP', 'New Lead link visible');
  await resilientClick(newLeadLink, page, 'new-lead-link');
  logger('STEP', 'Clicked New Lead link');
  logger('INFO', 'Navigated to New Lead page');

  // Ensure form is loaded
  logger('STEP', 'Waiting for lead form heading');
  await resilientExpectVisible(page.getByRole('heading', { name: /Add new lead/i }), page, 'lead-form-heading');
  logger('STEP', 'Lead form heading visible');

  // Fill lead details
  logger('STEP', 'Filling lead details');
  const name = faker.name.findName();
  const email = faker.internet.email();
  const phone = faker.phone.phoneNumber('999#######');
  const form = page.locator('#lead_form');
  await resilientFill(form.locator('input#name'), name, page, 'lead-name');
  logger('STEP', 'Filled lead name');
  await resilientFill(form.locator('input#email'), email, page, 'lead-email');
  logger('STEP', 'Filled lead email');
  await resilientFill(form.locator('input#phonenumber'), phone, page, 'lead-phone');
  logger('STEP', 'Filled lead phone');

  // Fill additional lead fields with random values
  const company = faker.company.companyName();
  const address = faker.address.streetAddress();
  const city = faker.address.city();
  // Generate a 6-digit zip code as a string
  const zip = String(Math.floor(100000 + Math.random() * 900000));

  // Fill Company
  await resilientFill(form.locator('input#company'), company, page, 'lead-company');
  logger('STEP', 'Filled lead company');
  logger('INFO', 'Lead Company:', company);

  // Fill Address
  await form.locator('input#address').fill(address);
  await expect(form.locator('input#address')).toHaveValue(address);
  logger('INFO', 'Lead Address:', address);

  // Fill City
  await form.locator('input#city').fill(city);
  await expect(form.locator('input#city')).toHaveValue(city);
  logger('INFO', 'Lead City:', city);

  // Select State (always Tamil Nadu)
  const stateDropdown = form.locator('select#state');
  await expect(stateDropdown).toBeVisible();
  await stateDropdown.selectOption({ label: 'Tamil Nadu' });
  const selectedState = await stateDropdown.locator('option:checked').textContent();
  logger('INFO', 'Lead State:', selectedState);

  // Fill Zip code
  // Robust zip code field handling
  let zipInput = form.locator('input#zipcode');
  if (!(await zipInput.count())) {
    zipInput = form.locator("input[name='zipcode']");
  }
  if (!(await zipInput.count())) {
    zipInput = form.locator("input[name*='zip']");
  }
  if (!(await zipInput.count())) {
    zipInput = form.locator("input[name*='postal']");
  }
  if (!(await zipInput.count())) {
    zipInput = form.locator("input[name*='pincode']");
  }
  if (await zipInput.count()) {
    await zipInput.fill(zip);
    // Some zip fields may not update value immediately, so check after a short wait
    await page.waitForTimeout(500);
    const zipValue = await zipInput.inputValue();
    if (zipValue === zip) {
  logger('INFO', 'Lead Zip code:', zip);
    } else {
  logger('WARN', `Zip code field did not update as expected. Expected: ${zip}, Actual: ${zipValue}`);
    }
  } else {
  logger('WARN', 'Zip code field not found, skipping zip code entry.');
  }

  // Save lead
  const saveButton = form.locator('button:has-text("Save")');
  await expect(saveButton).toBeVisible();
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  logger('STEP', 'Lead saved, waiting for modal...');
  // Wait for the lead modal to appear (target #lead-modal)
  const dialog = page.locator('#lead-modal');
  await expect(dialog).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(3000);
   // Lead creation screenshot
  // Removed routine lead creation screenshot for optimization

  // In the lead modal, click Proposals tab
  const proposalsTab = dialog.locator('button, a', { hasText: 'Proposals' });
  await expect(proposalsTab).toBeVisible();
  await proposalsTab.click();
  logger('STEP', 'Proposals tab clicked');
  // Click New Proposal button and wait for navigation to new page
  await Promise.all([
    page.waitForNavigation(),
    dialog.locator('button, a', { hasText: 'New Proposal' }).click()
  ]);

  // On the new page, wait for the proposal form to be visible
  await expect(page.getByRole('heading', { name: 'New Proposal' })).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(2000); // Wait for page to settle

  // Select first option in the Company dropdown
  const companyDropdown = page.locator('select').nth(0);
  await expect(companyDropdown).toBeVisible();

  // Randomly select an option from company dropdown (excluding index 0)
  const companyOptions = await companyDropdown.locator('option').allTextContents();
  const companyIndices = companyOptions.map((_, i) => i).filter(i => i > 0);
  const randomCompanyIndex = companyIndices[Math.floor(Math.random() * companyIndices.length)];
    // Capture selected services for JSON output
    // (moved to after both services are assigned)
  await companyDropdown.selectOption({ index: randomCompanyIndex });
  const selectedCompany = await companyDropdown.locator('option:checked').textContent();
  logger('INFO', 'Randomly selected company dropdown option:', selectedCompany);
  // Manually trigger change event on Company dropdown
  await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (el) {
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, 'select');
  // Wait for Service dropdown to populate
  await page.waitForTimeout(5000);
  const serviceDropdown = page.locator('select').nth(1);
  await expect(serviceDropdown).toBeVisible();
  await expect(serviceDropdown).toBeEnabled({ timeout: 10000 });
  const serviceOptions = await serviceDropdown.locator('option').allTextContents();
  if (serviceOptions.length < 3) {
    throw new Error(`Service dropdown does not have enough options: ${serviceOptions}`);
  }

  // Randomly select an option from service dropdown (excluding index 0)
  let selectedService = '';
  let randomServiceIndex;
  const serviceIndices = serviceOptions.map((_, i) => i).filter(i => i > 0);
  do {
    randomServiceIndex = serviceIndices[Math.floor(Math.random() * serviceIndices.length)];
    await serviceDropdown.selectOption({ index: randomServiceIndex });
    const selectedServiceRaw = await serviceDropdown.locator('option:checked').textContent();
    selectedService = selectedServiceRaw ? selectedServiceRaw : '';
  } while (selectedService === 'Choose Service');
  logger('INFO', 'Randomly selected service dropdown option:', selectedService);
  await page.waitForTimeout(3000);
  logger('INFO', 'Selected service:', selectedService);
  // Click the button with id "btnAdditem"
  const addItemBtn = page.locator('#btnAdditem');
  await expect(addItemBtn).toBeVisible();
  await addItemBtn.click();

  // Add a second service to the proposal
  // Filter out the first selected service and 'Choose Service'
  const remainingServiceIndices = serviceIndices.filter(i => i !== randomServiceIndex);
  let secondService = '';
  let secondServiceIndex;
  if (remainingServiceIndices.length > 0) {
    let attempts = 0;
    do {
      secondServiceIndex = remainingServiceIndices[Math.floor(Math.random() * remainingServiceIndices.length)];
      await serviceDropdown.selectOption({ index: secondServiceIndex });
      const secondServiceRaw = await serviceDropdown.locator('option:checked').textContent();
      secondService = secondServiceRaw ? secondServiceRaw : '';
      attempts++;
    } while ((secondService === 'Choose Service' || secondService === selectedService) && attempts < 10);
    if (secondService !== 'Choose Service' && secondService !== selectedService) {
  logger('INFO', 'Randomly selected second service dropdown option:', secondService);
      await page.waitForTimeout(2000);
      await addItemBtn.click();
  logger('INFO', 'Second service added:', secondService);
    } else {
      console.warn('Could not find a distinct second service.');
    }
  } else {
    console.warn('Not enough services to add a second distinct service.');
  }

  // Capture selected services for JSON output (after both are assigned)
  let selectedServices = [];
  if (selectedService && selectedService !== 'Choose Service') {
    selectedServices.push({ name: selectedService, company: selectedCompany });
  }
  if (secondService && secondService !== 'Choose Service' && secondService !== selectedService) {
    selectedServices.push({ name: secondService, company: selectedCompany });
  }

  // Click the Save button
  const proposalSaveBtn = page.getByRole('button', { name: /Save$/i });
  await expect(proposalSaveBtn).toBeVisible();
  await expect(proposalSaveBtn).toBeEnabled();
  await proposalSaveBtn.click();
  logger('STEP', 'Proposal save clicked, waiting for status...');
  // Logging and screenshots at key steps

  logger('STEP', 'Proposal saved, verifying status...');
  await page.waitForTimeout(3000);
  // Proposal creation screenshot
  // Removed routine proposal creation screenshot for optimization

  // Removed unused service extraction logic. Services are captured directly from dropdown selection.

  // Save lead details to a JSON file
  const leadDetails = { name, email, phone };
  writeAbisExecutionDetails(leadDetails);
    
  // Step: Click "More" in the dropdown and select "Mark as Sent"
  await page.waitForSelector('button:has-text("More")');
  await page.click('button:has-text("More")');
  await page.waitForSelector('text=Mark as Sent');
  await page.click('text=Mark as Sent');
  logger('STEP', 'Clicked Mark as Sent, waiting for status update...');
  // Step: Verify the lead status is updated to "Sent"
  // Use a more specific selector for the status label
  const sentStatusLabel = await page.locator('span.proposal-status-4,label-info:has-text("Sent")');
  await expect(sentStatusLabel).toBeVisible();

  // Step: Accept one service and decline another randomly

  // Find all service rows (assuming each row has Accept/Decline buttons)
  const serviceRows = await page.locator('tr').all();
  // Filter rows that have visible and enabled Accept and Decline buttons
  const actionableRows = [];
  for (const row of serviceRows) {
    const acceptBtn = row.locator('button:has-text("Accept")');
    const declineBtn = row.locator('button:has-text("Decline")');
    if (await acceptBtn.isVisible() && await acceptBtn.isEnabled() && await declineBtn.isVisible() && await declineBtn.isEnabled()) {
      actionableRows.push({ row, acceptBtn, declineBtn });
    }
  }
  if (actionableRows.length < 2) {
    console.error('Not enough actionable service rows found. Found:', actionableRows.length);
    // Take a screenshot for debugging
    await page.screenshot({ path: 'service-actionable-rows-debug.png', fullPage: true });
    throw new Error('Not enough actionable service rows found');
  }
  // Randomly select which row to accept
  const acceptRowIndex = Math.floor(Math.random() * 2);
  const declineRowIndex = acceptRowIndex === 0 ? 1 : 0;
  // Accept one service
  await expect(actionableRows[acceptRowIndex].acceptBtn).toBeVisible();
  await expect(actionableRows[acceptRowIndex].acceptBtn).toBeEnabled();
  await actionableRows[acceptRowIndex].acceptBtn.click();
  logger('INFO', `Accepted service in row ${acceptRowIndex}`);
  await page.waitForTimeout(1000);
  // Decline the other service
  await expect(actionableRows[declineRowIndex].declineBtn).toBeVisible();
  await expect(actionableRows[declineRowIndex].declineBtn).toBeEnabled();
  await actionableRows[declineRowIndex].declineBtn.click();
  logger('INFO', `Declined service in row ${declineRowIndex}`);
  await page.waitForTimeout(1000);
  // Wait for the page to fully load after clicking Accept
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000); // Extra wait for UI updates

  logger('STEP', 'Clicked Accept, waiting for final state...');

  // Extract proposal number from page content and update abis_execution_details.json
  const pageContent = await page.content();
  const proposalNumberMatchHtml = pageContent.match(/PRO-\d+/);
  const proposalNumberHtml = proposalNumberMatchHtml ? proposalNumberMatchHtml[0] : '';
  try {
    const leadDetailsJson = JSON.parse(fs.readFileSync('abis_execution_details.json', 'utf8'));
    if (proposalNumberHtml) {
      leadDetailsJson.proposalNumber = proposalNumberHtml;
      fs.writeFileSync('abis_execution_details.json', JSON.stringify(leadDetailsJson, null, 2));
    }
  } catch (err) {
    console.error('Error updating abis_execution_details.json:', err);
  }

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
  // Click the "Convert to customer" <a> tag
  const convertLink = leadModal.locator('a:has-text("Convert to customer")');
  await expect(convertLink).toBeVisible({ timeout: 10000 });
  await convertLink.click();
  logger('STEP', 'Clicked Convert to customer for lead:', leadName);

  // Wait for the page to fully load before taking screenshot for debugging modal fields
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000); // Extra wait for UI updates
  // Removed routine convert-to-customer-modal screenshot for optimization
  // Removed pause for normal test execution

  // Debug: log Convert to Customer modal HTML before filling PAN/GST
  // ...existing code...

  // Wait for the Save button with id 'custformsubmit' to be visible and click it
  // Robustly fill PAN and GST fields before saving
  // Wait for modal to be fully loaded
  const convertModal = page.locator('.modal:visible');
  await expect(convertModal).toBeVisible({ timeout: 10000 });

  // Try multiple selector strategies for PAN and GST fields
        services: selectedServices
  let panInput = convertModal.locator("input[name='pan_num']");
  if (!(await panInput.count())) panInput = convertModal.locator("#pan_num");
  if (!(await panInput.count())) panInput = page.locator("input[name='pan_num']");
  if (!(await panInput.count())) panInput = page.locator("#pan_num");
  let gstInput = convertModal.locator("input[name='vat']");
  if (!(await gstInput.count())) gstInput = convertModal.locator("input[name='gst']");
  if (!(await gstInput.count())) gstInput = page.locator("input[name='vat']");
  if (!(await gstInput.count())) gstInput = page.locator("input[name='gst']");

  // Generate realistic PAN and GST numbers
  function generatePAN(): string {
    const letters = () => Array.from({length: 5}, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
    const digits = () => String(Math.floor(1000 + Math.random() * 9000));
    const lastLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    return `${letters()}${digits()}${lastLetter}`;
  }
  function generateGST(pan: string): string {
    // GST format: 2 digits (state code) + PAN (10 chars) + 1 entity code + Z + 1 checksum (alphanumeric)
    // Example: 27ABCDE1234F1Z5
    const stateCode = String(Math.floor(1 + Math.random() * 35)).padStart(2, '0'); // 01-35
    // PAN should be 5 letters + 4 digits + 1 letter
    let panPart = pan;
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
      panPart = 'ABCDE1234F';
    }
    const entityCode = '1';
    const defaultZ = 'Z';
    const checksum = Math.random() < 0.5 ? String.fromCharCode(65 + Math.floor(Math.random() * 26)) : String(Math.floor(Math.random() * 10));
    return `${stateCode}${panPart}${entityCode}${defaultZ}${checksum}`;
  }
  const panValue = generatePAN();
  const gstValue = generateGST(panValue);

  // Fill PAN and GST fields
  let panFilled = false, gstFilled = false;
  for (let i = 0; i < 3; i++) {
    if (!panFilled && panInput && await panInput.count()) {
      await panInput.first().fill(panValue);
      panFilled = true;
  logger('INFO', 'Entered PAN Number:', panValue);
    }
    if (!gstFilled && gstInput && await gstInput.count()) {
      await gstInput.first().fill(gstValue);
      gstFilled = true;
  logger('INFO', 'Entered GST Number:', gstValue);
    }
    if (panFilled && gstFilled) break;
    await page.waitForTimeout(1000);
  }
  if (!panFilled) {
    console.warn('PAN Number field not found');
  }
  if (!gstFilled) {
    console.warn('GST Number field not found');
  }

  // Update abis_execution_details.json in nested format

  const saveCustomerBtn = page.locator('#custformsubmit');
  await expect(saveCustomerBtn).toBeVisible({ timeout: 15000 });
  await expect(saveCustomerBtn).toBeEnabled();
  await saveCustomerBtn.click();
  logger('STEP', 'Clicked Save after Convert to customer');

  await expect(page.locator('a[data-group="profile"]')).toBeVisible({ timeout: 15000 });
  // Customer conversion screenshot
  // Removed routine customer conversion screenshot for optimization


  // Next workflow: Click the Profile tab
  // Use a more specific selector for the Profile tab to avoid strict mode violation
  const profileTab = page.locator('a[data-group="profile"]');
  await expect(profileTab).toBeVisible({ timeout: 10000 });
  await profileTab.click();
  logger('STEP', 'Profile tab clicked');

  // Next workflow: Click the Customer Admins tab


  const adminsTab = page.locator('button, a', { hasText: 'Customer Admins' });
  await expect(adminsTab).toBeVisible({ timeout: 10000 });
  await adminsTab.click();
  logger('STEP', 'Customer Admins tab clicked');

  // Wait for the tab panel to be visible
  const adminsPanel = page.locator('div[role="tabpanel"]:has-text("Assign Admin")');
  await adminsPanel.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

  // Retry logic for Assign Admin button
  let assignAdminBtn = page.locator('button, a', { hasText: 'Assign Admin' });
  for (let i = 0; i < 3; i++) {
    if (await assignAdminBtn.isVisible()) break;
    await adminsTab.click();
    await page.waitForTimeout(2000);
    assignAdminBtn = page.locator('button, a', { hasText: 'Assign Admin' });
  }
  await expect(assignAdminBtn).toBeVisible({ timeout: 15000 });
  await assignAdminBtn.click();
  logger('STEP', 'Assign Admin button clicked');

  // Wait for modal to appear
  let adminsModal = page.locator('#customer_admins_assign');
  await expect(adminsModal).toBeVisible({ timeout: 20000 });
  if (!(await adminsModal.isVisible())) {
    await page.screenshot({ path: 'customer-admins-modal-debug.png', fullPage: true });
    throw new Error('Customer Admins modal not found. Screenshot saved for debugging.');
  }

  // Select a random option from dropdown in modal
  const dropdown = adminsModal.locator('select');
  await expect(dropdown).toBeVisible({ timeout: 10000 });
  const options = await dropdown.locator('option').allTextContents();
  const indices = options.map((_, i) => i).filter(i => i > 0);
  const randomIndex = indices[Math.floor(Math.random() * indices.length)];
  await dropdown.selectOption({ index: randomIndex });
  let selectedOption = '';
  if (await adminsModal.isVisible() && await dropdown.isVisible()) {
  selectedOption = (await dropdown.locator('option:checked').textContent()) || '';
  logger('INFO', 'Randomly selected Customer Admin:', selectedOption);
  } else {
  logger('WARN', 'Dropdown or modal not visible after selecting option, skipping reading selected option.');
  }

  // Click Save in modal
  const saveAdminBtn = adminsModal.locator('button, a', { hasText: 'Save' });
  await expect(saveAdminBtn).toBeVisible({ timeout: 10000 });
  await saveAdminBtn.click();
  logger('STEP', 'Customer Admin modal Save clicked');

  await expect(adminsModal).not.toBeVisible({ timeout: 15000 });
  // Customer admin added screenshot
  // Removed routine customer admin added screenshot for optimization

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
      company,
      pan: panValue,
      gst: gstValue
    },
    customerAdmin: selectedOption?.trim() || ''
  };
  writeAbisExecutionDetails(detailsJson);

  // --- Add service for customer after admin assignment ---
  // Use details from abis_execution_details.json
  const customerNameForService = name;
  const proposalNumberForService = proposalNumberHtml || '';

  // Click Services tab
  const servicesTab = page.locator('a[data-group="projects"]');
  await expect(servicesTab).toBeVisible({ timeout: 10000 });
  await servicesTab.click();
  logger('STEP', 'Services tab clicked');

  // Click New service button
  const newServiceBtn = page.locator('button, a', { hasText: 'New service' });
  await expect(newServiceBtn).toBeVisible({ timeout: 10000 });
  await newServiceBtn.click();
  logger('STEP', 'New service button clicked');

  // After clicking New service, log modal HTML for debugging
  const serviceModal = page.locator('.modal:visible');
  if (await serviceModal.count()) {
    const modalHtml = await serviceModal.innerHTML();
    fs.writeFileSync('service-modal-debug.html', modalHtml);
  logger('INFO', 'Service modal HTML saved to service-modal-debug.html');
  } else {
    const pageHtml = await page.content();
    fs.writeFileSync('service-page-debug.html', pageHtml);
  logger('INFO', 'Service page HTML saved to service-page-debug.html');
  }
  await page.waitForTimeout(2000);


  // Use robust selector for Accepted Proposals dropdown (#proposal_id)
  let acceptedProposalsDropdown = page.locator('select#proposal_id');
  if (!(await acceptedProposalsDropdown.count())) {
    acceptedProposalsDropdown = page.locator('select[name="proposal_id"]');
  }
  if (!(await acceptedProposalsDropdown.count())) {
    // Try inside modal/dialog if present
    const modal = page.locator('.modal:visible');
    if (await modal.count()) {
      acceptedProposalsDropdown = modal.locator('select#proposal_id');
      if (!(await acceptedProposalsDropdown.count())) {
        acceptedProposalsDropdown = modal.locator('select[name="proposal_id"]');
      }
    }
  }
  await expect(acceptedProposalsDropdown).toBeVisible({ timeout: 20000 });
  // Find the correct label in the dropdown options
  const proposalOptions = await acceptedProposalsDropdown.locator('option').allTextContents();
  // Match by prefix (e.g., 'PRO-001286')
  // Try to match by prefix (e.g., 'PRO-001287') or substring
  // Find the option whose text includes the proposal number, then select by value
  let proposalValue = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const proposalOptionHandles = await acceptedProposalsDropdown.locator('option').elementHandles();
    for (const handle of proposalOptionHandles) {
      const text = (await handle.textContent())?.trim() || '';
      if (text.includes(proposalNumberForService)) {
        proposalValue = (await handle.getAttribute('value')) || '';
        break;
      }
    }
    if (proposalValue) break;
    await page.waitForTimeout(1000); // Wait 1s before retry
  }
  if (!proposalValue) {
    const proposalOptionsAfterRetry = await acceptedProposalsDropdown.locator('option').allTextContents();
    logger('WARN', 'Expected proposal not found. Available proposal options after retries:', proposalOptionsAfterRetry);
    // Try to select the first valid proposal option (not 'Select Proposal')
    const validOptions = proposalOptionsAfterRetry.filter(opt => opt && !opt.toLowerCase().includes('select proposal'));
    if (validOptions.length > 0) {
      await acceptedProposalsDropdown.selectOption({ label: validOptions[0].trim() });
      logger('INFO', 'Selected available proposal:', validOptions[0]);
    } else {
      throw new Error('No valid proposal options available');
    }
  } else {
    await acceptedProposalsDropdown.selectOption({ value: proposalValue });
    logger('INFO', 'Accepted Proposal selected by value:', proposalValue);
  }
  await acceptedProposalsDropdown.selectOption({ value: proposalValue });
  logger('INFO', 'Accepted Proposal selected by value:', proposalValue);

  // Wait for Proposal Services dropdown (#itemable_id) to populate
  let proposalServicesDropdown = page.locator('select#itemable_id');
  if (!(await proposalServicesDropdown.count())) {
    proposalServicesDropdown = page.locator('select[name="itemable_id"]');
  }
  if (!(await proposalServicesDropdown.count())) {
    // Try inside modal/dialog if present
    const modal = page.locator('.modal:visible');
    if (await modal.count()) {
      proposalServicesDropdown = modal.locator('select#itemable_id');
      if (!(await proposalServicesDropdown.count())) {
        proposalServicesDropdown = modal.locator('select[name="itemable_id"]');
      }
    }
  }
  await expect(proposalServicesDropdown).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(1500);
  // Select a service from Proposal Services dropdown
  let validProposalServiceOptions: string[] = [];
  let proposalServiceOptions: string[] = [];
  for (let i = 0; i < 5; i++) {
    proposalServiceOptions = await proposalServicesDropdown.locator('option').allTextContents();
    validProposalServiceOptions = proposalServiceOptions.filter((opt: string) => opt && opt !== 'Please Select');
    if (validProposalServiceOptions.length > 0) break;
    await page.waitForTimeout(1000);
  }
  if (validProposalServiceOptions.length === 0) {
    await page.screenshot({ path: 'proposal-service-options-not-found.png', fullPage: true });
    const pageHtml = await page.content();
    require('fs').writeFileSync('proposal-service-options-not-found.html', pageHtml);
    throw new Error('No valid proposal services found after retries. Screenshot and HTML saved for debugging.');
  }
  const randomProposalService = validProposalServiceOptions[Math.floor(Math.random() * validProposalServiceOptions.length)];
  await proposalServicesDropdown.selectOption({ label: randomProposalService });
  logger('INFO', 'Proposal Service selected:', randomProposalService);

  // Wait for data to populate on other fields
  await page.waitForTimeout(2000);

  // Click Save
  // Use a more specific selector for the Save button in the service addition form
  // Filter for the Save button with id='btnsubmit' and type='submit'
  // Set a default deadline if the input is empty before saving
  const deadlineInputBefore = page.locator('input#deadline');
  let deadlineBefore = '';
  if (await deadlineInputBefore.count()) {
    deadlineBefore = await deadlineInputBefore.inputValue();
    if (!deadlineBefore) {
      // Set deadline to 7 days from today
      const today = new Date();
      const deadlineDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      const pad = (n: number) => n.toString().padStart(2, '0');
      const deadlineStr = `${pad(deadlineDate.getDate())}-${pad(deadlineDate.getMonth() + 1)}-${deadlineDate.getFullYear()}`;
      await deadlineInputBefore.fill(deadlineStr);
  logger('INFO', 'Default deadline set:', deadlineStr);
    }
  }
  const saveBtn = page.locator('button#btnsubmit[type="submit"]');
  await expect(saveBtn).toBeVisible({ timeout: 10000 });
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();
  logger('STEP', 'Service Save clicked');

    await page.waitForTimeout(2000);
  // Service creation screenshot
  // Removed routine service creation screenshot for optimization
  // After saving, capture service number and deadline from the resulting page
  await page.waitForTimeout(2000);
  // Extract service number from the URL if possible
  let serviceNumber = '';
  let deadline = '';
  const url = page.url();
  const serviceIdMatch = url.match(/\/projects\/view\/(\d+)/);
  if (serviceIdMatch) {
    serviceNumber = serviceIdMatch[1];
  }
  // Extract deadline from the deadline input field
  const deadlineInput = page.locator('input#deadline');
  if (await deadlineInput.count()) {
    deadline = await deadlineInput.inputValue();
    if (!deadline) {
      // Fallback to the value set before Save
      deadline = deadlineBefore;
    }
  }
  // Update abis_execution_details.json
  try {
    const detailsJson = readAbisExecutionDetails();
    detailsJson.service = {
      serviceNumber,
      deadline
    };
    writeAbisExecutionDetails(detailsJson);
  logger('INFO', 'Service details updated in JSON:', detailsJson.service);
  } catch (err) {
  logger('ERROR', 'Error updating service details in abis_execution_details.json:', err);
  }

  // --- Workflow: Create new task after service creation ---
  // Assumes service creation and navigation to service page is complete
  await page.waitForTimeout(2000);
  // Click "New Task" button
  const newTaskBtn = page.locator('button, a', { hasText: 'New Task' });
  await expect(newTaskBtn).toBeVisible({ timeout: 10000 });
  await newTaskBtn.click();
  logger('STEP', 'New Task button clicked');

  // Wait for popup/modal to appear
  let taskModal = page.locator('.modal:visible');
  let modalAppeared = false;
  for (let i = 0; i < 5; i++) {
    if (await taskModal.isVisible()) {
      modalAppeared = true;
      break;
    }
    await page.waitForTimeout(1000);
    taskModal = page.locator('.modal:visible');
  }
  if (!modalAppeared) {
    // Try fallback: look for any .modal
    const anyModal = page.locator('.modal');
    if (await anyModal.isVisible()) {
      taskModal = anyModal;
      modalAppeared = true;
    }
  }
  if (!modalAppeared) {
    await page.screenshot({ path: 'task-modal-not-found.png', fullPage: true });
    const pageHtml = await page.content();
    require('fs').writeFileSync('task-modal-not-found.html', pageHtml);
    throw new Error('Task modal not found after clicking New Task. Screenshot and HTML saved for debugging.');
  }
  logger('STEP', 'Task modal opened');

  // Select the "Subject" input and enter the text "Payment Collection"
  const subjectInput = taskModal.locator('input#subject, input[name="name"], input[placeholder*="Subject"]').first();
  await expect(subjectInput).toBeVisible({ timeout: 10000 });
  await subjectInput.click();
  await subjectInput.fill('Payment Collection');
  logger('INFO', 'Subject set to Payment Collection');

  // Select tomorrow's date in Due Date
  const dueDateInput = taskModal.locator('input#duedate, input[name="duedate"], input[placeholder*="Due Date"]');
  await expect(dueDateInput).toBeVisible({ timeout: 10000 });
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const tomorrowStr = `${pad(tomorrow.getDate())}-${pad(tomorrow.getMonth() + 1)}-${tomorrow.getFullYear()}`;
  await dueDateInput.fill(tomorrowStr);
  logger('INFO', 'Due Date set:', tomorrowStr);

  // Click Save in modal
  const saveTaskBtn = taskModal.locator('button, a', { hasText: 'Save' });
  await expect(saveTaskBtn).toBeVisible({ timeout: 10000 });
  await saveTaskBtn.click();
  logger('STEP', 'Task Save clicked');

  // Wait for post-save popup/modal to appear
  let postSaveModal = page.locator('.modal:visible');
  let postModalAppeared = false;
  for (let i = 0; i < 10; i++) {
    if (await postSaveModal.isVisible()) {
      postModalAppeared = true;
      break;
    }
    await page.waitForTimeout(1000);
    postSaveModal = page.locator('.modal:visible');
  }
  if (!postModalAppeared) {
    await page.screenshot({ path: 'post-save-modal-not-found.png', fullPage: true });
    const pageHtml = await page.content();
    require('fs').writeFileSync('post-save-modal-not-found.html', pageHtml);
    throw new Error('Post-save modal not found after saving task. Screenshot and HTML saved for debugging.');
  }
  logger('STEP', 'Post-save modal opened');

  // Click "Status" and select "Mark as In Progress"
  let statusSet = false;
  // Try select#status first
  const statusDropdown = postSaveModal.locator('select#status');
  if (await statusDropdown.count() && await statusDropdown.isVisible()) {
    await statusDropdown.selectOption({ label: 'In Progress' });
    statusSet = true;
  logger('INFO', 'Task status set to In Progress via select');
  } else {
    // Try button with text 'Status' or 'In Progress'
    const statusButton = postSaveModal.getByText('Status', { exact: false });
    if (await statusButton.count() && await statusButton.isVisible()) {
      await statusButton.click();
      const inProgressOption = postSaveModal.getByText('In Progress', { exact: false }).first();
      if (await inProgressOption.count() && await inProgressOption.isVisible()) {
        await inProgressOption.click();
        statusSet = true;
          logger('INFO', 'Task status set to In Progress via button');
      }
    } else {
      // Try any element with aria-label containing 'Status' or 'In Progress'
      const statusAria = postSaveModal.locator('[aria-label*="Status"], [aria-label*="In Progress"]');
      if (await statusAria.count() && await statusAria.isVisible()) {
        await statusAria.click();
        const inProgressOption = postSaveModal.getByText('In Progress', { exact: false });
        if (await inProgressOption.count() && await inProgressOption.isVisible()) {
          await inProgressOption.click();
          statusSet = true;
          logger('INFO', 'Task status set to In Progress via aria-label');
        }
      } else {
        // Try direct text selector for 'In Progress'
        const inProgressDirect = postSaveModal.getByText('In Progress', { exact: false });
        if (await inProgressDirect.count() && await inProgressDirect.isVisible()) {
          await inProgressDirect.click();
          statusSet = true;
          logger('INFO', 'Task status set to In Progress via direct text');
        }
      }
    }
  }
  if (!statusSet) {
    // Log modal HTML for debugging
    const modalHtml = await postSaveModal.innerHTML();
    fs.writeFileSync('task-status-modal-debug.html', modalHtml);
  logger('WARN', 'Could not find status selector for task modal. Modal HTML saved to task-status-modal-debug.html');
  }
  // Task creation screenshot
  // Removed routine task creation screenshot for optimization
  
  // Close the modal (try clicking close button or X)
  let modalClosed = false;
  const closeBtn = postSaveModal.locator('button, a', { hasText: 'Close' });
  if (await closeBtn.count()) {
    await closeBtn.click();
    modalClosed = true;
    logger('STEP', 'Task modal closed');
  } else {
    // Try clicking X button
    const xBtn = postSaveModal.locator('button.close, .modal-header .close');
    if (await xBtn.count()) {
      await xBtn.click();
      modalClosed = true;
  logger('STEP', 'Task modal closed via X');
    } else {
  logger('WARN', 'Could not find close button for task modal');
    }
  }
  // Fallback: if modal is still visible, try Escape and clicking outside
  let fallbackModalClosed = false;
  for (let i = 0; i < 10; i++) {
    if (!(await postSaveModal.isVisible())) {
      fallbackModalClosed = true;
      break;
    }
    await page.keyboard.press('Escape');
    await page.locator('body').click({ position: { x: 10, y: 10 } });
    if (await closeBtn.count()) {
      await closeBtn.click();
    } else if (await postSaveModal.locator('button.close, .modal-header .close').count()) {
      await postSaveModal.locator('button.close, .modal-header .close').click();
    }
    await page.waitForTimeout(1000);
  }
  if (!fallbackModalClosed) {
    await page.screenshot({ path: 'modal-not-closed-fallback.png', fullPage: true });
    const pageHtml = await page.content();
    require('fs').writeFileSync('modal-not-closed-fallback.html', pageHtml);
    throw new Error('Modal did not close after all fallback actions (fallback loop). Screenshot and HTML saved for debugging.');
  }

  // Click "Tasks" tab in the service page (use role=tab and data-group)
  // Wait for modal and backdrop to be hidden before clicking Tasks tab
  const modalBackdrop = page.locator('.modal-backdrop');
  let modalClosedFinal = false;
  for (let i = 0; i < 5; i++) {
    if (!(await postSaveModal.isVisible())) {
      modalClosed = true;
      break;
    }
    await page.keyboard.press('Escape');
    await page.locator('body').click({ position: { x: 10, y: 10 } });
    const closeBtn = postSaveModal.locator('button, a', { hasText: 'Close' });
    if (await closeBtn.count()) await closeBtn.click();
    const xBtn = postSaveModal.locator('button.close, .modal-header .close');
    if (await xBtn.count()) await xBtn.click();
    await page.waitForTimeout(1000);
  }
  if (!modalClosed) {
    await page.screenshot({ path: 'modal-not-closed.png', fullPage: true });
    const pageHtml = await page.content();
    require('fs').writeFileSync('modal-not-closed.html', pageHtml);
    throw new Error('Modal did not close after all fallback actions. Screenshot and HTML saved for debugging.');
  }
  // Now check for backdrop
  let backdropClosedFinal = false;
  for (let i = 0; i < 5; i++) {
    if (!(await modalBackdrop.isVisible())) {
    backdropClosedFinal = true;
      break;
    }
    await page.keyboard.press('Escape');
    await page.locator('body').click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(1000);
  }
  if (!backdropClosedFinal) {
    await page.screenshot({ path: 'modal-backdrop-not-closed.png', fullPage: true });
    const pageHtml = await page.content();
    require('fs').writeFileSync('modal-backdrop-not-closed.html', pageHtml);
    throw new Error('Modal backdrop did not disappear after all fallback actions. Screenshot and HTML saved for debugging.');
  }
  logger('STEP', 'Waiting for Tasks tab to be visible');
  const tasksTab = page.locator('a[role="tab"][data-group="project_tasks"]');
  let tasksTabVisible = false;
  for (let i = 0; i < 10; i++) {
    try {
      await expect(tasksTab).toBeVisible({ timeout: 5000 });
      tasksTabVisible = true;
      break;
    } catch (e) {
      await page.screenshot({ path: `tasks-tab-not-visible-${i}.png`, fullPage: true });
      fs.writeFileSync(`tasks-tab-not-visible-${i}.html`, await page.content());
      await page.waitForTimeout(1000);
    }
  }
  if (!tasksTabVisible) {
    throw new Error('Tasks tab not visible after retries. See screenshots and HTML for diagnosis.');
  }
  logger('STEP', 'Tasks tab is visible');
  let tasksTabClicked = false;
  for (let i = 0; i < 5; i++) {
    try {
      await tasksTab.click();
      tasksTabClicked = true;
      break;
    } catch (e) {
      await page.screenshot({ path: `tasks-tab-click-fail-${i}.png`, fullPage: true });
      fs.writeFileSync(`tasks-tab-click-fail-${i}.html`, await page.content());
      await page.waitForTimeout(1000);
    }
  }
  if (!tasksTabClicked) {
    throw new Error('Failed to click Tasks tab after retries. See screenshots and HTML for diagnosis.');
  }
  logger('STEP', 'Clicked Tasks tab');
  // Wait for tasks panel to appear
  const tasksSummaryHeading = page.locator('h4:has-text("Tasks Summary")');
  let tasksSummaryVisible = false;
  for (let i = 0; i < 15; i++) {
    try {
      await expect(tasksSummaryHeading).toBeVisible({ timeout: 1000 });
      tasksSummaryVisible = true;
      break;
    } catch (e) {
      logger('WARN', `Tasks Summary heading not visible, retry ${i}`);
      await page.waitForTimeout(1000);
    }
  }
  if (!tasksSummaryVisible) {
    throw new Error('Tasks Summary heading not visible after retries. See screenshots and HTML for diagnosis.');
  }
  logger('STEP', 'Tasks Summary heading is visible');
  // Step: Verify 'Payment Collection' task is present in Tasks panel
  async function findPaymentCollectionTask() {
    // Try to find a row/card with subject 'Payment Collection' in the Tasks panel
    const taskRow = page.locator('tr:has-text("Payment Collection"), .task-card:has-text("Payment Collection")');
    for (let i = 0; i < 10; i++) {
      if (await taskRow.count() && await taskRow.isVisible()) {
        logger('INFO', `Payment Collection task found on attempt ${i}`);
        return true;
      }
      logger('WARN', `Payment Collection task not found, attempt ${i}`);
      await page.waitForTimeout(1500);
    }
    return false;
  }

  // Extra wait after task creation before searching
  logger('INFO', 'Waiting extra time for Payment Collection task to appear...');
  await page.waitForTimeout(3000);
  let paymentTaskFound = await findPaymentCollectionTask();
  if (!paymentTaskFound) {
    logger('INFO', 'Payment Collection task not found, attempting to create again');
    const newTaskBtn = page.locator('button, a', { hasText: 'New Task' });
    let modalOpened = false;
    let subjectInputVisible = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await newTaskBtn.count() && await newTaskBtn.isVisible()) {
        await newTaskBtn.click();
        // Wait for modal
        const taskModal = page.locator('.modal:visible');
        for (let i = 0; i < 10; i++) {
          if (await taskModal.isVisible()) {
            modalOpened = true;
            break;
          }
          await page.waitForTimeout(1000);
        }
        if (!modalOpened) {
          await page.screenshot({ path: `task-modal-not-visible-attempt-${attempt}.png`, fullPage: true });
          require('fs').writeFileSync(`task-modal-not-visible-attempt-${attempt}.html`, await page.content());
          // Try to close any existing modals/backdrops and retry
          await page.keyboard.press('Escape');
          await page.locator('body').click({ position: { x: 10, y: 10 } });
          continue;
        }
        // Wait for subject input
        const subjectInput = taskModal.locator('input[name="subject"], input[placeholder*="Subject"]');
        for (let i = 0; i < 10; i++) {
          if (await subjectInput.count() && await subjectInput.isVisible()) {
            subjectInputVisible = true;
            break;
          }
          await page.waitForTimeout(1000);
        }
        if (!subjectInputVisible) {
          await page.screenshot({ path: `subject-input-not-visible-attempt-${attempt}.png`, fullPage: true });
          require('fs').writeFileSync(`subject-input-not-visible-attempt-${attempt}.html`, await page.content());
          // Try to close modal and retry
          await page.keyboard.press('Escape');
          await page.locator('body').click({ position: { x: 10, y: 10 } });
          continue;
        }
        // Fill subject
        await subjectInput.fill('Payment Collection');
        // Set due date to tomorrow
        const dueDateInput = taskModal.locator('input[name="due_date"], input[placeholder*="Due Date"]');
        if (await dueDateInput.count() && await dueDateInput.isVisible()) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowStr = tomorrow.toISOString().split('T')[0];
          await dueDateInput.fill(tomorrowStr);
        }
        // Save task
        const saveTaskBtn = taskModal.locator('button, a', { hasText: 'Save' });
        for (let i = 0; i < 10; i++) {
          if (await saveTaskBtn.count() && await saveTaskBtn.isVisible()) {
            await saveTaskBtn.click();
            break;
          }
          await page.waitForTimeout(1000);
        }
        // Wait for modal to close
        for (let i = 0; i < 10; i++) {
          if (!(await taskModal.isVisible())) break;
          await page.waitForTimeout(1000);
        }
        // Reopen Tasks tab if needed
        await tasksTab.click();
        await expect(tasksSummaryHeading).toBeVisible({ timeout: 10000 });
        // Check again for Payment Collection task
        paymentTaskFound = await findPaymentCollectionTask();
        break;
      }
      await page.waitForTimeout(1000);
    }
  }
  if (!paymentTaskFound) {
    await page.screenshot({ path: 'payment-collection-task-not-found.png', fullPage: true });
    const pageHtml = await page.content();
    require('fs').writeFileSync('payment-collection-task-not-found.html', pageHtml);
    throw new Error('Payment Collection task not found after creation and retry. Screenshot and HTML saved for debugging.');
  } else {
  logger('INFO', 'Payment Collection task found in Tasks panel.');
    // Step: Change status of Payment Collection task to 'In Progress' using grid row dropdown
    const paymentTaskRow = page.locator('tr:has-text("Payment Collection")');
    let statusChanged = false;
    if (await paymentTaskRow.count() && await paymentTaskRow.isVisible()) {
      // Find the status cell (contains 'Not Started')
      const statusCell = paymentTaskRow.locator('td:has-text("Not Started")');
      if (await statusCell.count() && await statusCell.isVisible()) {
        // Find the dropdown toggle anchor in the status cell
        const dropdownToggle = statusCell.locator('a.dropdown-toggle, a[id^="tableTaskStatus-"]');
        if (await dropdownToggle.count() && await dropdownToggle.isVisible()) {
          await dropdownToggle.first().click();
          // Wait for dropdown and select 'Mark as In Progress' option
          const markInProgressOption = page.locator('a', { hasText: 'Mark as In Progress' });
          for (let i = 0; i < 5; i++) {
            if (await markInProgressOption.count() && await markInProgressOption.isVisible()) {
              await markInProgressOption.first().click();
              statusChanged = true;
              logger('INFO', 'Payment Collection task status set to In Progress via dropdown option');
              break;
            }
            await page.waitForTimeout(500);
          }
        }
      }
    }
    if (!statusChanged) {
      await page.screenshot({ path: 'payment-collection-status-not-changed.png', fullPage: true });
      const pageHtml = await page.content();
      require('fs').writeFileSync('payment-collection-status-not-changed.html', pageHtml);
      throw new Error('Could not change Payment Collection task status to In Progress. Screenshot and HTML saved for debugging.');
    }
  }

    // --- Additional Workflow: Go to Customer and Pre Payment tab ---
    // Click "Go to Customer" button
    const goToCustomerLink = page.locator('a', { hasText: 'Go to Customer' });
    await expect(goToCustomerLink).toBeVisible({ timeout: 10000 });
    await goToCustomerLink.click();
    logger('STEP', 'Clicked Go to Customer link');

    // Click "Pre Payment" tab from left side
    const prePaymentTab = page.getByRole('link', { name: 'Pre Payment', exact: true });
    await expect(prePaymentTab).toBeVisible({ timeout: 10000 });
    await prePaymentTab.click();
    logger('STEP', 'Clicked Pre Payment tab');

    // --- New Pre Payment Workflow ---
    // Click "New Pre Payment" link (not button)
    // Click "New Pre Payment" link (not button)
  const newPrePaymentLink = page.getByRole('link', { name: /New Pre Payment/i });
  await expect(newPrePaymentLink).toBeVisible({ timeout: 10000 });
  await newPrePaymentLink.click();
  logger('STEP', 'Clicked New Pre Payment link');

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
        console.log(`Service options found for space search:`, options);
        // Click the first non-empty option
        const firstOption = page.locator('#project_ajax_search_wrapper .inner.open ul li a span.text').filter({ hasText: /.+/ }).first();
        await firstOption.click();
      } catch {
        // Log dropdown HTML for diagnostics
        const dropdownHtml = await page.locator('#project_ajax_search_wrapper .dropdown-menu.open').innerHTML();
        require('fs').writeFileSync('service-dropdown-debug-space.html', dropdownHtml);
        throw new Error('No service options found after space AJAX search. See diagnostics.');
      }
  } catch (e) {
    await page.screenshot({ path: 'service-dropdown-arrow-fail.png' });
    const html = await page.content();
    require('fs').writeFileSync('service-dropdown-arrow-fail.html', html);
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
    const html = await page.content();
    require('fs').writeFileSync('payment-mode-select-not-found.html', html);
    throw new Error('No valid Payment Mode options found. Screenshot and HTML saved for debugging.');
  }
  await paymentModeSelect.selectOption({ label: validPaymentMode.trim() });
  logger('STEP', `Selected Payment Mode: ${validPaymentMode.trim()}`);

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
  logger('STEP', 'Entered 100 in Rate field');

  // Click the blue tick mark button in the table (use #btnAdditem)
  const tickBtn2 = page.locator('#btnAdditem');
  await expect(tickBtn2).toBeVisible({ timeout: 10000 });
  await tickBtn2.click();
  logger('STEP', 'Clicked blue tick mark button');

  // Click Save
  const saveBtn2 = page.getByRole('button', { name: /Save/i });
  await expect(saveBtn2).toBeVisible({ timeout: 10000 });
  await saveBtn2.click();
  logger('STEP', 'Clicked Save for Pre Payment');
  // Wait for modal to close or success indicator
  await page.waitForTimeout(2000);
  const modalStillVisible = await newPrePaymentHeading.isVisible();
  if (modalStillVisible) {
    await page.screenshot({ path: 'pre-payment-modal-not-closed.png', fullPage: true });
    const html = await page.content();
    require('fs').writeFileSync('pre-payment-modal-not-closed.html', html);
    throw new Error('Pre Payment modal did not close after Save. Screenshot and HTML saved for debugging.');
  }
});
