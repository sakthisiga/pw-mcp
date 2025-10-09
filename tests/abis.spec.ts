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

  // Wait for the Save button with id 'custformsubmit' to be visible and click it
  const saveCustomerBtn = page.locator('#custformsubmit');
  await expect(saveCustomerBtn).toBeVisible({ timeout: 15000 });
  await expect(saveCustomerBtn).toBeEnabled();
  await saveCustomerBtn.click();
  console.log('Clicked Save after Convert to customer');

});
