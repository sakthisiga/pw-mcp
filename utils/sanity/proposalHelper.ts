import { Page, expect } from '@playwright/test';
import { CommonHelper } from '../commonHelper';

export interface ProposalDetails {
  proposalNumber: string;
  services: Array<{
    name: string;
    company: string;
  }>;
}

export class ProposalHelper {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Creates a proposal with two random services and accepts one while declining another
   * @param leadModalLocator - The lead modal locator (typically '#lead-modal')
   * @returns ProposalDetails containing proposal number and selected services
   */
  async createAndProcessProposal(leadModalLocator: string = '#lead-modal'): Promise<ProposalDetails> {
    const { page } = this;
    const dialog = page.locator(leadModalLocator);

    // Navigate to Proposals tab
    await this.navigateToProposalsTab(dialog);

    // Create proposal with services
    const { selectedCompany, selectedServices } = await this.createProposalWithServices();

    // Save proposal
    await this.saveProposal();

    // Mark as sent
    await this.markProposalAsSent();

    // Accept/Decline services
    await this.acceptAndDeclineServices();

    // Extract proposal number
    const proposalNumber = await this.extractProposalNumber();

    return {
      proposalNumber,
      services: selectedServices,
    };
  }

  /**
   * Navigate to Proposals tab in lead modal
   */
  private async navigateToProposalsTab(dialog: any): Promise<void> {
    const proposalsTab = dialog.locator('button, a', { hasText: 'Proposals' });
    await expect(proposalsTab).toBeVisible();
    await proposalsTab.click();
    CommonHelper.logger('STEP', 'Proposals tab clicked');

    // Click New Proposal and wait for navigation
    await Promise.all([
      this.page.waitForNavigation(),
      dialog.locator('button, a', { hasText: 'New Proposal' }).click(),
    ]);

    // Wait for proposal form
    await expect(this.page.getByRole('heading', { name: 'New Proposal' })).toBeVisible({ timeout: 10000 });
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Create proposal by selecting company and two services
   */
  private async createProposalWithServices(): Promise<{
    selectedCompany: string;
    selectedServices: Array<{ name: string; company: string }>;
  }> {
    // Select company
    const selectedCompany = await this.selectCompany();

    // Trigger change event for cascading dropdown
    await this.triggerDropdownChange();

    // Wait for service dropdown to populate
    await this.page.waitForTimeout(5000);

    // Select first service
    const firstService = await this.selectService();

    // Add first service
    await this.clickAddItemButton();

    // Select second service
    const secondService = await this.selectSecondService(firstService.index);

    // Build services array
    const selectedServices = [];
    if (firstService.name && firstService.name !== 'Choose Service') {
      selectedServices.push({ name: firstService.name, company: selectedCompany });
    }
    if (secondService && secondService !== 'Choose Service' && secondService !== firstService.name) {
      selectedServices.push({ name: secondService, company: selectedCompany });
    }

    return { selectedCompany, selectedServices };
  }

  /**
   * Select company from dropdown
   */
  private async selectCompany(): Promise<string> {
    const companyDropdown = this.page.locator('select').nth(0);
    await expect(companyDropdown).toBeVisible();

    // Get options and select random (excluding index 0)
    const companyOptions = await companyDropdown.locator('option').allTextContents();
    const companyIndices = companyOptions.map((_, i) => i).filter(i => i > 0);
    const randomCompanyIndex = companyIndices[Math.floor(Math.random() * companyIndices.length)];

    await companyDropdown.selectOption({ index: randomCompanyIndex });
    const selectedCompany = await companyDropdown.locator('option:checked').textContent();
    CommonHelper.logger('INFO', 'Randomly selected company dropdown option:', selectedCompany);

    return selectedCompany || '';
  }

  /**
   * Manually trigger change event for cascading dropdown
   */
  private async triggerDropdownChange(): Promise<void> {
    await this.page.evaluate(() => {
      const el = document.querySelector('select');
      if (el) {
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  /**
   * Select first service from dropdown
   */
  private async selectService(): Promise<{ name: string; index: number }> {
    const serviceDropdown = this.page.locator('select').nth(1);
    await expect(serviceDropdown).toBeVisible();
    await expect(serviceDropdown).toBeEnabled({ timeout: 10000 });

    const serviceOptions = await serviceDropdown.locator('option').allTextContents();
    if (serviceOptions.length < 3) {
      throw new Error(`Service dropdown does not have enough options: ${serviceOptions}`);
    }

    // Select random service (excluding index 0 and 'Choose Service')
    let selectedService = '';
    let randomServiceIndex = 0;
    const serviceIndices = serviceOptions.map((_, i) => i).filter(i => i > 0);

    do {
      randomServiceIndex = serviceIndices[Math.floor(Math.random() * serviceIndices.length)];
      await serviceDropdown.selectOption({ index: randomServiceIndex });
      const selectedServiceRaw = await serviceDropdown.locator('option:checked').textContent();
      selectedService = selectedServiceRaw ? selectedServiceRaw : '';
    } while (selectedService === 'Choose Service');

    CommonHelper.logger('INFO', 'Randomly selected service dropdown option:', selectedService);
    await this.page.waitForTimeout(3000);

    return { name: selectedService, index: randomServiceIndex };
  }

  /**
   * Click the "Add Item" button
   */
  private async clickAddItemButton(): Promise<void> {
    const addItemBtn = this.page.locator('#btnAdditem');
    await expect(addItemBtn).toBeVisible();
    await addItemBtn.click();
  }

  /**
   * Select second service (different from first)
   */
  private async selectSecondService(firstServiceIndex: number): Promise<string> {
    const serviceDropdown = this.page.locator('select').nth(1);
    const serviceOptions = await serviceDropdown.locator('option').allTextContents();
    const serviceIndices = serviceOptions.map((_, i) => i).filter(i => i > 0);

    const remainingServiceIndices = serviceIndices.filter(i => i !== firstServiceIndex);
    let secondService = '';
    let secondServiceIndex;

    if (remainingServiceIndices.length > 0) {
      let attempts = 0;
      const firstServiceName = serviceOptions[firstServiceIndex];

      do {
        secondServiceIndex = remainingServiceIndices[Math.floor(Math.random() * remainingServiceIndices.length)];
        await serviceDropdown.selectOption({ index: secondServiceIndex });
        const secondServiceRaw = await serviceDropdown.locator('option:checked').textContent();
        secondService = secondServiceRaw ? secondServiceRaw : '';
        attempts++;
      } while ((secondService === 'Choose Service' || secondService === firstServiceName) && attempts < 10);

      if (secondService !== 'Choose Service' && secondService !== firstServiceName) {
        CommonHelper.logger('INFO', 'Randomly selected second service dropdown option:', secondService);
        await this.page.waitForTimeout(2000);
        await this.clickAddItemButton();
        CommonHelper.logger('INFO', 'Second service added:', secondService);
      } else {
        CommonHelper.logger('WARN', 'Could not find a distinct second service.');
      }
    } else {
      CommonHelper.logger('WARN', 'Not enough services to add a second distinct service.');
    }

    return secondService;
  }

  /**
   * Save the proposal
   */
  private async saveProposal(): Promise<void> {
    const proposalSaveBtn = this.page.getByRole('button', { name: /Save$/i });
    await expect(proposalSaveBtn).toBeVisible();
    await expect(proposalSaveBtn).toBeEnabled();
    await proposalSaveBtn.click();
    CommonHelper.logger('STEP', 'Proposal save clicked, waiting for status...');

    await this.page.waitForTimeout(3000);
    CommonHelper.logger('STEP', 'Proposal saved, verifying status...');
  }

  /**
   * Mark proposal as sent
   */
  private async markProposalAsSent(): Promise<void> {
    await this.page.waitForSelector('button:has-text("More")');
    await this.page.click('button:has-text("More")');
    await this.page.waitForSelector('text=Mark as Sent');
    await this.page.click('text=Mark as Sent');
    CommonHelper.logger('STEP', 'Clicked Mark as Sent, waiting for status update...');

    // Verify status updated
    const sentStatusLabel = this.page.locator('span.proposal-status-4,label-info:has-text("Sent")');
    await expect(sentStatusLabel).toBeVisible();
  }

  /**
   * Accept one service and decline another randomly
   */
  private async acceptAndDeclineServices(): Promise<void> {
    // Find all service rows with Accept/Decline buttons
    const serviceRows = await this.page.locator('tr').all();
    const actionableRows = [];

    for (const row of serviceRows) {
      const acceptBtn = row.locator('button:has-text("Accept")');
      const declineBtn = row.locator('button:has-text("Decline")');

      if (
        (await acceptBtn.isVisible()) &&
        (await acceptBtn.isEnabled()) &&
        (await declineBtn.isVisible()) &&
        (await declineBtn.isEnabled())
      ) {
        actionableRows.push({ row, acceptBtn, declineBtn });
      }
    }

    if (actionableRows.length < 2) {
      await this.page.screenshot({ path: 'service-actionable-rows-debug.png', fullPage: true });
      throw new Error(`Not enough actionable service rows found. Found: ${actionableRows.length}`);
    }

    // Randomly select which row to accept and which to decline
    const acceptRowIndex = Math.floor(Math.random() * 2);
    const declineRowIndex = acceptRowIndex === 0 ? 1 : 0;

    // Accept one service
    await expect(actionableRows[acceptRowIndex].acceptBtn).toBeVisible();
    await expect(actionableRows[acceptRowIndex].acceptBtn).toBeEnabled();
    await actionableRows[acceptRowIndex].acceptBtn.click();
    CommonHelper.logger('INFO', `Accepted service in row ${acceptRowIndex}`);
    await this.page.waitForTimeout(1000);

    // Decline the other service
    await expect(actionableRows[declineRowIndex].declineBtn).toBeVisible();
    await expect(actionableRows[declineRowIndex].declineBtn).toBeEnabled();
    await actionableRows[declineRowIndex].declineBtn.click();
    CommonHelper.logger('INFO', `Declined service in row ${declineRowIndex}`);
    await this.page.waitForTimeout(1000);

    // Wait for page to settle
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(2000);

    CommonHelper.logger('STEP', 'Clicked Accept, waiting for final state...');
  }

  /**
   * Extract proposal number from page content
   */
  private async extractProposalNumber(): Promise<string> {
    const pageContent = await this.page.content();
    const proposalNumberMatch = pageContent.match(/PRO-\d+/);
    const proposalNumber = proposalNumberMatch ? proposalNumberMatch[0] : '';

    if (proposalNumber) {
      CommonHelper.logger('INFO', 'Extracted proposal number:', proposalNumber);
    } else {
      CommonHelper.logger('WARN', 'Proposal number not found in page content');
    }

    return proposalNumber;
  }
}
