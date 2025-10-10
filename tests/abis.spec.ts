import { test, expect } from '@playwright/test';
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
  test.setTimeout(90000);
  // Login
  await page.goto(APP_BASE_URL!);
  await page.fill('input[name="email"]', E2E_USER!);
  await page.fill('input[name="password"]', E2E_PASS!);
  await page.click('button:has-text("Login")');
  await expect(page.locator('text=Invoices Awaiting Payment')).toBeVisible();
  console.log('Login successful');

  // Navigate to leads page and click New Lead
  await page.goto(`${APP_BASE_URL}/leads`);
  const newLeadLink = page.locator('a', { hasText: 'New Lead' });
  await expect(newLeadLink).toBeVisible();
  await newLeadLink.click();
  console.log('Navigated to New Lead page');

  // Ensure form is loaded
  await expect(page.getByRole('heading', { name: /Add new lead/i })).toBeVisible();

  // Fill lead details
  const name = faker.name.findName();
  const email = faker.internet.email();
  const phone = faker.phone.phoneNumber('999#######');
  const form = page.locator('#lead_form');
  await form.locator('input#name').fill(name);
  await expect(form.locator('input#name')).toHaveValue(name);
  await form.locator('input#email').fill(email);
  await expect(form.locator('input#email')).toHaveValue(email);
  await form.locator('input#phonenumber').fill(phone);
  await expect(form.locator('input#phonenumber')).toHaveValue(phone);

  // Fill additional lead fields with random values
  const company = faker.company.companyName();
  const address = faker.address.streetAddress();
  const city = faker.address.city();
  // Generate a 6-digit zip code as a string
  const zip = String(Math.floor(100000 + Math.random() * 900000));

  // Fill Company
  await form.locator('input#company').fill(company);
  await expect(form.locator('input#company')).toHaveValue(company);
  console.log('Lead Company:', company);

  // Fill Address
  await form.locator('input#address').fill(address);
  await expect(form.locator('input#address')).toHaveValue(address);
  console.log('Lead Address:', address);

  // Fill City
  await form.locator('input#city').fill(city);
  await expect(form.locator('input#city')).toHaveValue(city);
  console.log('Lead City:', city);

  // Select State (always Tamil Nadu)
  const stateDropdown = form.locator('select#state');
  await expect(stateDropdown).toBeVisible();
  await stateDropdown.selectOption({ label: 'Tamil Nadu' });
  const selectedState = await stateDropdown.locator('option:checked').textContent();
  console.log('Lead State:', selectedState);

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
      console.log('Lead Zip code:', zip);
    } else {
      console.warn(`Zip code field did not update as expected. Expected: ${zip}, Actual: ${zipValue}`);
    }
  } else {
    console.warn('Zip code field not found, skipping zip code entry.');
  }

  // Save lead
  const saveButton = form.locator('button:has-text("Save")');
  await expect(saveButton).toBeVisible();
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  console.log('Lead saved, waiting for modal...');
  // Wait for the lead modal to appear (target #lead-modal)
  const dialog = page.locator('#lead-modal');
  await expect(dialog).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(3000);
   // Lead creation screenshot
  const leadScreenshot = await page.screenshot({ fullPage: true });
  test.info().attach('Lead Created', { body: leadScreenshot, contentType: 'image/png' });

  // In the lead modal, click Proposals tab
  const proposalsTab = dialog.locator('button, a', { hasText: 'Proposals' });
  await expect(proposalsTab).toBeVisible();
  await proposalsTab.click();
  console.log('Proposals tab clicked');
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
  console.log('Randomly selected company dropdown option:', selectedCompany);
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
  console.log('Randomly selected service dropdown option:', selectedService);
  await page.waitForTimeout(3000);
  console.log(`Selected service: ${selectedService}`);
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
      console.log('Randomly selected second service dropdown option:', secondService);
      await page.waitForTimeout(2000);
      await addItemBtn.click();
      console.log(`Second service added: ${secondService}`);
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
  console.log('Proposal save clicked, waiting for status...');
  // Logging and screenshots at key steps

  console.log('Proposal saved, verifying status...');
  await page.waitForTimeout(3000);
  // Proposal creation screenshot
  const proposalScreenshot = await page.screenshot({ fullPage: true });
  test.info().attach('Proposal Created', { body: proposalScreenshot, contentType: 'image/png' });

  // Removed unused service extraction logic. Services are captured directly from dropdown selection.

  // Save lead details to a JSON file
  const leadDetails = { name, email, phone };
  writeAbisExecutionDetails(leadDetails);
    
  // Step: Click "More" in the dropdown and select "Mark as Sent"
  await page.waitForSelector('button:has-text("More")');
  await page.click('button:has-text("More")');
  await page.waitForSelector('text=Mark as Sent');
  await page.click('text=Mark as Sent');
  console.log('Clicked Mark as Sent, waiting for status update...');
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
  console.log(`Accepted service in row ${acceptRowIndex}`);
  await page.waitForTimeout(1000);
  // Decline the other service
  await expect(actionableRows[declineRowIndex].declineBtn).toBeVisible();
  await expect(actionableRows[declineRowIndex].declineBtn).toBeEnabled();
  await actionableRows[declineRowIndex].declineBtn.click();
  console.log(`Declined service in row ${declineRowIndex}`);
  await page.waitForTimeout(1000);
  // Wait for the page to fully load after clicking Accept
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000); // Extra wait for UI updates

  console.log('Clicked Accept, waiting for final state...');

  // Extract proposal number from page content and update abis_execution_details.json
  const pageContent = await page.content();
  const proposalNumberMatchHtml = pageContent.match(/PRO-\d+/);
  const proposalNumberHtml = proposalNumberMatchHtml ? proposalNumberMatchHtml[0] : '';
  try {
    const leadDetailsJson = JSON.parse(fs.readFileSync('abis_execution_details.json', 'utf8'));
    if (proposalNumberHtml) {
      leadDetailsJson.proposalNumber = proposalNumberHtml;
      fs.writeFileSync('abis_execution_details.json', JSON.stringify(leadDetailsJson, null, 2));
      console.log('Lead details with proposal number saved to JSON file:', leadDetailsJson);
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
  console.log('Clicked Convert to customer for lead:', leadName);

  // Wait for the page to fully load before taking screenshot for debugging modal fields
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000); // Extra wait for UI updates
  await page.screenshot({ path: 'convert-to-customer-modal.png', fullPage: true });
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
      console.log('Entered PAN Number:', panValue);
    }
    if (!gstFilled && gstInput && await gstInput.count()) {
      await gstInput.first().fill(gstValue);
      gstFilled = true;
      console.log('Entered GST Number:', gstValue);
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
  console.log('Clicked Save after Convert to customer');

  await expect(page.locator('a[data-group="profile"]')).toBeVisible({ timeout: 15000 });
  // Customer conversion screenshot
  const customerScreenshot = await page.screenshot({ fullPage: true });
  test.info().attach('Customer Converted', { body: customerScreenshot, contentType: 'image/png' });


  // Next workflow: Click the Profile tab
  // Use a more specific selector for the Profile tab to avoid strict mode violation
  const profileTab = page.locator('a[data-group="profile"]');
  await expect(profileTab).toBeVisible({ timeout: 10000 });
  await profileTab.click();
  console.log('Profile tab clicked');

  // Next workflow: Click the Customer Admins tab


  const adminsTab = page.locator('button, a', { hasText: 'Customer Admins' });
  await expect(adminsTab).toBeVisible({ timeout: 10000 });
  await adminsTab.click();
  console.log('Customer Admins tab clicked');

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
  console.log('Assign Admin button clicked');

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
  console.log('Randomly selected Customer Admin:', selectedOption);
  } else {
    console.warn('Dropdown or modal not visible after selecting option, skipping reading selected option.');
  }

  // Click Save in modal
  const saveAdminBtn = adminsModal.locator('button, a', { hasText: 'Save' });
  await expect(saveAdminBtn).toBeVisible({ timeout: 10000 });
  await saveAdminBtn.click();
  console.log('Customer Admin modal Save clicked');

  await expect(adminsModal).not.toBeVisible({ timeout: 15000 });
  // Customer admin added screenshot
  const adminScreenshot = await page.screenshot({ fullPage: true });
  test.info().attach('Customer Admin Added', { body: adminScreenshot, contentType: 'image/png' });

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
  console.log('Services tab clicked');

  // Click New service button
  const newServiceBtn = page.locator('button, a', { hasText: 'New service' });
  await expect(newServiceBtn).toBeVisible({ timeout: 10000 });
  await newServiceBtn.click();
  console.log('New service button clicked');

  // After clicking New service, log modal HTML for debugging
  const serviceModal = page.locator('.modal:visible');
  if (await serviceModal.count()) {
    const modalHtml = await serviceModal.innerHTML();
    fs.writeFileSync('service-modal-debug.html', modalHtml);
    console.log('Service modal HTML saved to service-modal-debug.html');
  } else {
    const pageHtml = await page.content();
    fs.writeFileSync('service-page-debug.html', pageHtml);
    console.log('Service page HTML saved to service-page-debug.html');
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
  const proposalOptionHandles = await acceptedProposalsDropdown.locator('option').elementHandles();
  let proposalValue = '';
  for (const handle of proposalOptionHandles) {
    const text = (await handle.textContent())?.trim() || '';
    if (text.includes(proposalNumberForService)) {
      proposalValue = (await handle.getAttribute('value')) || '';
      break;
    }
  }
  if (!proposalValue) {
    throw new Error(`Could not find proposal option with proposal number: ${proposalNumberForService}`);
  }
  await acceptedProposalsDropdown.selectOption({ value: proposalValue });
  console.log('Accepted Proposal selected by value:', proposalValue);

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
  const proposalServiceOptions = await proposalServicesDropdown.locator('option').allTextContents();
  const validProposalServiceOptions = proposalServiceOptions.filter((opt: string) => opt && opt !== 'Please Select');
  if (validProposalServiceOptions.length === 0) throw new Error('No valid proposal services found');
  const randomProposalService = validProposalServiceOptions[Math.floor(Math.random() * validProposalServiceOptions.length)];
  await proposalServicesDropdown.selectOption({ label: randomProposalService });
  console.log('Proposal Service selected:', randomProposalService);

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
      console.log('Default deadline set:', deadlineStr);
    }
  }
  const saveBtn = page.locator('button#btnsubmit[type="submit"]');
  await expect(saveBtn).toBeVisible({ timeout: 10000 });
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();
  console.log('Service Save clicked');

    await page.waitForTimeout(2000);
  // Service creation screenshot
  const serviceScreenshot = await page.screenshot({ fullPage: true });
  test.info().attach('Service Created', { body: serviceScreenshot, contentType: 'image/png' });
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
    console.log('Service details updated in JSON:', detailsJson.service);
  } catch (err) {
    console.error('Error updating service details in abis_execution_details.json:', err);
  }

  // --- Workflow: Create new task after service creation ---
  // Assumes service creation and navigation to service page is complete
  await page.waitForTimeout(2000);
  // Click "New Task" button
  const newTaskBtn = page.locator('button, a', { hasText: 'New Task' });
  await expect(newTaskBtn).toBeVisible({ timeout: 10000 });
  await newTaskBtn.click();
  console.log('New Task button clicked');

  // Wait for popup/modal to appear
  const taskModal = page.locator('.modal:visible');
  await expect(taskModal).toBeVisible({ timeout: 10000 });
  console.log('Task modal opened');

  // Select the "Subject" input and enter the text "Payment Collection"
  const subjectInput = taskModal.locator('input#subject, input[name="name"], input[placeholder*="Subject"]').first();
  await expect(subjectInput).toBeVisible({ timeout: 10000 });
  await subjectInput.click();
  await subjectInput.fill('Payment Collection');
  console.log('Subject set to Payment Collection');

  // Select tomorrow's date in Due Date
  const dueDateInput = taskModal.locator('input#duedate, input[name="duedate"], input[placeholder*="Due Date"]');
  await expect(dueDateInput).toBeVisible({ timeout: 10000 });
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const tomorrowStr = `${pad(tomorrow.getDate())}-${pad(tomorrow.getMonth() + 1)}-${tomorrow.getFullYear()}`;
  await dueDateInput.fill(tomorrowStr);
  console.log('Due Date set:', tomorrowStr);

  // Click Save in modal
  const saveTaskBtn = taskModal.locator('button, a', { hasText: 'Save' });
  await expect(saveTaskBtn).toBeVisible({ timeout: 10000 });
  await saveTaskBtn.click();
  console.log('Task Save clicked');

  // Wait for post-save popup/modal to appear
  await page.waitForTimeout(2000);
  const postSaveModal = page.locator('.modal:visible');
  await expect(postSaveModal).toBeVisible({ timeout: 10000 });
  console.log('Post-save modal opened');

  // Click "Status" and select "Mark as In Progress"
  let statusSet = false;
  // Try select#status first
  const statusDropdown = postSaveModal.locator('select#status');
  if (await statusDropdown.count() && await statusDropdown.isVisible()) {
    await statusDropdown.selectOption({ label: 'In Progress' });
    statusSet = true;
    console.log('Task status set to In Progress via select');
  } else {
    // Try button with text 'Status' or 'In Progress'
    const statusButton = postSaveModal.getByText('Status', { exact: false });
    if (await statusButton.count() && await statusButton.isVisible()) {
      await statusButton.click();
      const inProgressOption = postSaveModal.getByText('In Progress', { exact: false }).first();
      if (await inProgressOption.count() && await inProgressOption.isVisible()) {
        await inProgressOption.click();
        statusSet = true;
        console.log('Task status set to In Progress via button');
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
          console.log('Task status set to In Progress via aria-label');
        }
      } else {
        // Try direct text selector for 'In Progress'
        const inProgressDirect = postSaveModal.getByText('In Progress', { exact: false });
        if (await inProgressDirect.count() && await inProgressDirect.isVisible()) {
          await inProgressDirect.click();
          statusSet = true;
          console.log('Task status set to In Progress via direct text');
        }
      }
    }
  }
  if (!statusSet) {
    // Log modal HTML for debugging
    const modalHtml = await postSaveModal.innerHTML();
    fs.writeFileSync('task-status-modal-debug.html', modalHtml);
    console.warn('Could not find status selector for task modal. Modal HTML saved to task-status-modal-debug.html');
  }
  // Task creation screenshot
  const taskScreenshot = await page.screenshot({ fullPage: true });
  test.info().attach('Task Created', { body: taskScreenshot, contentType: 'image/png' });
  
  // Close the modal (try clicking close button or X)
  const closeBtn = postSaveModal.locator('button, a', { hasText: 'Close' });
  if (await closeBtn.count()) {
    await closeBtn.click();
    console.log('Task modal closed');
  } else {
    // Try clicking X button
    const xBtn = postSaveModal.locator('button.close, .modal-header .close');
    if (await xBtn.count()) {
      await xBtn.click();
      console.log('Task modal closed via X');
    } else {
      console.warn('Could not find close button for task modal');
    }
  }

  // Click "Tasks" tab in the service page (use role=tab and data-group)
  // Wait for modal and backdrop to be hidden before clicking Tasks tab
  const modalBackdrop = page.locator('.modal-backdrop');
  await expect(postSaveModal).not.toBeVisible({ timeout: 15000 });
  await expect(modalBackdrop).not.toBeVisible({ timeout: 15000 });
  const tasksTab = page.locator('a[role="tab"][data-group="project_tasks"]');
  await expect(tasksTab).toBeVisible({ timeout: 10000 });
  await tasksTab.click();
  await page.waitForTimeout(3000);
  console.log('Tasks tab clicked in service page');
});
