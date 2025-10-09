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

  // Step: Click the "Accept" button in the page.
  const acceptButton = page.getByRole('button', { name: /Accept/i });
  await expect(acceptButton).toBeVisible();
  await expect(acceptButton).toBeEnabled();
  await acceptButton.click();
    console.log('Clicked Accept button, waiting for page to load...');
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

});
