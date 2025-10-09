import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import fs from 'fs';
// Removed require for fs as we are using ES module imports
const faker = require('faker');
dotenv.config();

const APP_BASE_URL = process.env.APP_BASE_URL;
const E2E_USER = process.env.E2E_USER;
const E2E_PASS = process.env.E2E_PASS;

function randomString(length: number) {
  return Math.random().toString(36).substring(2, 2 + length);
}

test('Login to Abis, create lead, and create proposal', async ({ page }) => {
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
    await expect(zipInput).toHaveValue(zip);
    console.log('Lead Zip code:', zip);
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

  // Click the Save button
  const proposalSaveBtn = page.getByRole('button', { name: /Save$/i });
  await expect(proposalSaveBtn).toBeVisible();
  await expect(proposalSaveBtn).toBeEnabled();
  await proposalSaveBtn.click();
  console.log('Proposal save clicked, waiting for status...');
  // Logging and screenshots at key steps

  console.log('Proposal saved, verifying status...');

  // Save lead details to a JSON file
  const leadDetails = { name, email, phone };
  fs.writeFileSync('lead_details.json', JSON.stringify(leadDetails, null, 2));
    console.log('Lead details saved to JSON file:', leadDetails);
    
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
  // Filter rows that have Accept and Decline buttons
  const actionableRows = [];
  for (const row of serviceRows) {
    const hasAccept = await row.locator('button:has-text("Accept")').count() > 0;
    const hasDecline = await row.locator('button:has-text("Decline")').count() > 0;
    if (hasAccept && hasDecline) {
      actionableRows.push(row);
    }
  }
  if (actionableRows.length < 2) {
    throw new Error('Not enough actionable service rows found');
  }
  // Randomly select which row to accept
  const acceptRowIndex = Math.floor(Math.random() * 2);
  const declineRowIndex = acceptRowIndex === 0 ? 1 : 0;
  // Accept one service
  const acceptBtn = actionableRows[acceptRowIndex].locator('button:has-text("Accept")');
  await expect(acceptBtn).toBeVisible();
  await acceptBtn.click();
  console.log(`Accepted service in row ${acceptRowIndex}`);
  await page.waitForTimeout(1000);
  // Decline the other service
  const declineBtn = actionableRows[declineRowIndex].locator('button:has-text("Decline")');
  await expect(declineBtn).toBeVisible();
  await declineBtn.click();
  console.log(`Declined service in row ${declineRowIndex}`);
  await page.waitForTimeout(1000);
  // Wait for the page to fully load after clicking Accept
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000); // Extra wait for UI updates

  console.log('Clicked Accept, waiting for final state...');

  // Extract proposal number from page content and update lead_details.json
  const pageContent = await page.content();
  const proposalNumberMatchHtml = pageContent.match(/PRO-\d+/);
  const proposalNumberHtml = proposalNumberMatchHtml ? proposalNumberMatchHtml[0] : '';
  try {
    const leadDetailsJson = JSON.parse(fs.readFileSync('lead_details.json', 'utf8'));
    if (proposalNumberHtml) {
      leadDetailsJson.proposalNumber = proposalNumberHtml;
      fs.writeFileSync('lead_details.json', JSON.stringify(leadDetailsJson, null, 2));
      console.log('Lead details with proposal number saved to JSON file:', leadDetailsJson);
    }
  } catch (err) {
    console.error('Error updating lead_details.json:', err);
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

  // Pause and take screenshot for debugging modal fields
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
  let panInput = convertModal.locator("input[name='pan_num']");
  let gstInput = convertModal.locator("input[name='vat']");
  if (!(await panInput.count())) panInput = convertModal.locator("#pan_num");
  if (!(await panInput.count())) panInput = page.locator("input[name='pan_num']");
  if (!(await panInput.count())) panInput = page.locator("#pan_num");
  if (!(await gstInput.count())) gstInput = convertModal.locator("input[name='gst']");
  if (!(await gstInput.count())) gstInput = page.locator("input[name='vat']");
  if (!(await gstInput.count())) gstInput = page.locator("input[name='gst']");

  // Retry filling if not found immediately
  let panFilled = false, gstFilled = false;
  let panValue = 'NA', gstValue = 'NA';
  for (let i = 0; i < 3; i++) {
    if (!panFilled && await panInput.count()) {
      await panInput.first().fill('NA');
      panFilled = true;
      panValue = 'NA';
      console.log('Entered NA for PAN Number');
    }
    if (!gstFilled && await gstInput.count()) {
      await gstInput.first().fill('NA');
      gstFilled = true;
      gstValue = 'NA';
      console.log('Entered NA for GST Number');
    }
    if (panFilled && gstFilled) break;
    await page.waitForTimeout(1000);
  }
  if (!panFilled) {
    console.warn('PAN Number field not found');
    panValue = '';
  }
  if (!gstFilled) {
    console.warn('GST Number field not found');
    gstValue = '';
  }

  // Update lead_details.json with PAN, GST, and additional lead info
  let allDetails = {};
  try {
    allDetails = JSON.parse(fs.readFileSync('lead_details.json', 'utf8'));
  } catch (err) {
    allDetails = {};
  }
  allDetails.pan = panValue;
  allDetails.gst = gstValue;
  allDetails.company = company;
  allDetails.address = address;
  allDetails.city = city;
  allDetails.state = selectedState;
  allDetails.zip = zip;
  fs.writeFileSync('lead_details.json', JSON.stringify(allDetails, null, 2));
  console.log('Lead details updated with PAN and GST:', allDetails);

  const saveCustomerBtn = page.locator('#custformsubmit');
  await expect(saveCustomerBtn).toBeVisible({ timeout: 15000 });
  await expect(saveCustomerBtn).toBeEnabled();
  await saveCustomerBtn.click();
  console.log('Clicked Save after Convert to customer');

  // Print all lead details at end of execution
  try {
    const finalDetails = JSON.parse(fs.readFileSync('lead_details.json', 'utf8'));
    console.log('Final Lead Details:', finalDetails);
  } catch (err) {
    console.error('Error reading final lead details:', err);
  }

});
