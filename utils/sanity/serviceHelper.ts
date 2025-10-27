import { Page, expect } from '@playwright/test';
import { CommonHelper } from '../commonHelper';

interface ServiceDetails {
  serviceNumber: string;
  serviceName: string;
  deadline: string;
}

export class ServiceHelper {
  private selectedServiceName = '';
  
  constructor(private page: Page) {}

  /**
   * Create a service from an accepted proposal
   * @param proposalNumber - The proposal number (e.g., "PRO-001234")
   * @returns ServiceDetails with serviceNumber and deadline
   */
  async createService(proposalNumber: string): Promise<ServiceDetails> {
    await this.navigateToServicesTab();
    await this.clickNewServiceButton();
    await this.selectAcceptedProposal(proposalNumber);
    await this.selectProposalService();
    await this.setDeadlineIfEmpty();
    await this.saveService();
    return await this.captureServiceDetails();
  }

  private async navigateToServicesTab(): Promise<void> {
    const servicesTab = this.page.locator('a[data-group="projects"]');
    await expect(servicesTab).toBeVisible({ timeout: 10000 });
    await servicesTab.click();
    CommonHelper.logger('STEP', 'Services tab clicked');
  }

  private async clickNewServiceButton(): Promise<void> {
    const newServiceBtn = this.page.locator('button, a', { hasText: 'New service' });
    await expect(newServiceBtn).toBeVisible({ timeout: 10000 });
    await newServiceBtn.click();
    CommonHelper.logger('STEP', 'New service button clicked');
    await this.page.waitForTimeout(2000);
  }

  private async selectAcceptedProposal(proposalNumber: string): Promise<void> {
    // Use robust selector for Accepted Proposals dropdown (#proposal_id)
    let acceptedProposalsDropdown = this.page.locator('select#proposal_id');
    if (!(await acceptedProposalsDropdown.count())) {
      acceptedProposalsDropdown = this.page.locator('select[name="proposal_id"]');
    }
    if (!(await acceptedProposalsDropdown.count())) {
      // Try inside modal/dialog if present
      const modal = this.page.locator('.modal:visible');
      if (await modal.count()) {
        acceptedProposalsDropdown = modal.locator('select#proposal_id');
        if (!(await acceptedProposalsDropdown.count())) {
          acceptedProposalsDropdown = modal.locator('select[name="proposal_id"]');
        }
      }
    }
    await expect(acceptedProposalsDropdown).toBeVisible({ timeout: 20000 });

    const normalizedProposal = (proposalNumber || '').trim();
    // extract digits from PRO-001156 -> '001156' and integer form '1156'
    const proposalDigitsRaw = (normalizedProposal.match(/\d+/g) || []).join('');
    const proposalDigitsInt = proposalDigitsRaw ? String(parseInt(proposalDigitsRaw, 10)) : '';
    CommonHelper.logger('INFO', 'Looking for proposal:', normalizedProposal, 'digitsRaw:', proposalDigitsRaw, 'digitsInt:', proposalDigitsInt);

    let proposalValue = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      const optionHandles = await acceptedProposalsDropdown.locator('option').elementHandles();
      for (const handle of optionHandles) {
        const text = (await handle.textContent())?.trim() || '';
        const dataText = (await handle.getAttribute('data-text')) || '';
        const val = (await handle.getAttribute('value')) || '';
        CommonHelper.logger('INFO', `Proposal option: text="${text}", data-text="${dataText}", value="${val}"`);

        // Match by exact visible PRO-... text
        if (normalizedProposal && text.includes(normalizedProposal)) {
          proposalValue = val || dataText;
          break;
        }
        // Match by numeric id present in data-text or value (handles leading zeros)
        if (proposalDigitsRaw && (dataText === proposalDigitsRaw || dataText === proposalDigitsInt || val === proposalDigitsRaw || val === proposalDigitsInt)) {
          proposalValue = val || dataText;
          break;
        }
        // Match if the visible text contains the integer digits (e.g., 'PRO-001156' vs '1156')
        if (proposalDigitsInt && text.includes(proposalDigitsInt)) {
          proposalValue = val || dataText;
          break;
        }
      }
      if (proposalValue) break;
      await this.page.waitForTimeout(1000);
    }

    if (!proposalValue) {
      await this.handleProposalFallback(acceptedProposalsDropdown, normalizedProposal, proposalDigitsInt);
    } else {
      await this.selectProposalByValue(acceptedProposalsDropdown, proposalValue, normalizedProposal, proposalDigitsInt);
    }
  }

  private async handleProposalFallback(dropdown: any, normalizedProposal: string, proposalDigitsInt: string): Promise<void> {
    const proposalOptionsAfterRetry = await dropdown.locator('option').allTextContents();
    CommonHelper.logger('WARN', 'Expected proposal not found. Available proposal options after retries:', proposalOptionsAfterRetry);
    
    const validOptions = proposalOptionsAfterRetry.filter((opt: string) => opt && !opt.toLowerCase().includes('select proposal'));
    if (validOptions.length > 0) {
      const fallbackLabel = validOptions[0].trim();
      CommonHelper.logger('INFO', 'Attempting fallback selection by label ->', fallbackLabel);
      
      const optionHandles = await dropdown.locator('option').elementHandles();
      let foundValue = '';
      let foundText = '';
      for (const h of optionHandles) {
        const t = ((await h.textContent()) || '').trim();
        const v = (await h.getAttribute('value')) || '';
        if (t.includes(fallbackLabel) || t.includes(fallbackLabel.replace(/\s+/g, ' '))) {
          foundValue = v;
          foundText = t;
          break;
        }
      }
      
      if (foundValue) {
        CommonHelper.logger('INFO', 'Found option for fallback label. value:', foundValue, 'text:', foundText);
        const setOk = await this.page.evaluate((args: { sel: string; val: string }) => {
          const { sel, val } = args;
          const s = document.querySelector(sel) as HTMLSelectElement | null;
          if (!s) return false;
          s.value = val;
          s.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }, { sel: 'select#proposal_id, select[name="proposal_id"]', val: foundValue });
        
        if (!setOk) {
          await dropdown.selectOption({ value: foundValue });
        }
        
        const checkedText = ((await dropdown.locator('option:checked').textContent()) || '').trim();
        if (!checkedText || !checkedText.includes(fallbackLabel) && !checkedText.includes(proposalDigitsInt || '')) {
          CommonHelper.logger('WARN', 'Fallback selection did not stick. checkedText:', checkedText, 'attemptedValue:', foundValue);
        } else {
          CommonHelper.logger('INFO', 'Selected available proposal by value (fallback):', foundValue, 'label:', checkedText);
        }
      } else {
        await dropdown.selectOption({ label: fallbackLabel });
        CommonHelper.logger('INFO', 'Selected available proposal by label (direct fallback):', fallbackLabel);
      }
    } else {
      throw new Error('No valid proposal options available');
    }
  }

  private async selectProposalByValue(dropdown: any, proposalValue: string, normalizedProposal: string, proposalDigitsInt: string): Promise<void> {
    try {
      await dropdown.selectOption({ value: proposalValue });
      CommonHelper.logger('INFO', 'Accepted Proposal selected by value:', proposalValue);
    } catch (err) {
      CommonHelper.logger('WARN', 'selectOption by value failed, falling back to label selection. Value:', proposalValue, 'Error:', String(err));
      const labels = await dropdown.locator('option').allTextContents();
      const matchLabel = labels.find((l: string) => l && normalizedProposal && l.includes(normalizedProposal)) || 
                         labels.find((l: string) => l && proposalDigitsInt && l.includes(proposalDigitsInt));
      if (matchLabel) {
        await dropdown.selectOption({ label: matchLabel.trim() });
        CommonHelper.logger('INFO', 'Accepted Proposal selected by label fallback:', matchLabel.trim());
      } else {
        throw err;
      }
    }
  }

  private async selectProposalService(): Promise<void> {
    // Wait for Proposal Services dropdown (#itemable_id) to populate
    let proposalServicesDropdown = this.page.locator('select#itemable_id');
    if (!(await proposalServicesDropdown.count())) {
      proposalServicesDropdown = this.page.locator('select[name="itemable_id"]');
    }
    if (!(await proposalServicesDropdown.count())) {
      const modal = this.page.locator('.modal:visible');
      if (await modal.count()) {
        proposalServicesDropdown = modal.locator('select#itemable_id');
        if (!(await proposalServicesDropdown.count())) {
          proposalServicesDropdown = modal.locator('select[name="itemable_id"]');
        }
      }
    }
    
    await expect(proposalServicesDropdown).toBeVisible({ timeout: 10000 });
    await this.page.waitForTimeout(1500);
    
    // Select a service from Proposal Services dropdown
    let validProposalServiceOptions: string[] = [];
    for (let i = 0; i < 5; i++) {
      const proposalServiceOptions = await proposalServicesDropdown.locator('option').allTextContents();
      validProposalServiceOptions = proposalServiceOptions.filter((opt: string) => opt && opt !== 'Please Select');
      if (validProposalServiceOptions.length > 0) break;
      await this.page.waitForTimeout(1000);
    }
    
    if (validProposalServiceOptions.length === 0) {
      await this.page.screenshot({ path: 'proposal-service-options-not-found.png', fullPage: true });
      CommonHelper.logger('WARN', 'proposal-service-options-not-found: saved screenshot for debugging');
      throw new Error('No valid proposal services found after retries. Screenshot and HTML saved for debugging.');
    }
    
    const randomProposalService = validProposalServiceOptions[Math.floor(Math.random() * validProposalServiceOptions.length)];
    await proposalServicesDropdown.selectOption({ label: randomProposalService });
    this.selectedServiceName = randomProposalService.trim();
    CommonHelper.logger('INFO', 'Proposal Service selected:', randomProposalService);
    
    // Wait for data to populate on other fields
    await this.page.waitForTimeout(2000);
  }

  private deadlineBefore = '';

  private async setDeadlineIfEmpty(): Promise<void> {
    const deadlineInputBefore = this.page.locator('input#deadline');
    if (await deadlineInputBefore.count()) {
      this.deadlineBefore = await deadlineInputBefore.inputValue();
      if (!this.deadlineBefore) {
        // Set deadline to 7 days from today
        const today = new Date();
        const deadlineDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        const pad = (n: number) => n.toString().padStart(2, '0');
        const deadlineStr = `${pad(deadlineDate.getDate())}-${pad(deadlineDate.getMonth() + 1)}-${deadlineDate.getFullYear()}`;
        await deadlineInputBefore.fill(deadlineStr);
        CommonHelper.logger('INFO', 'Default deadline set:', deadlineStr);
      }
    }
  }

  private async saveService(): Promise<void> {
    const saveBtn = this.page.locator('button#btnsubmit[type="submit"]');
    await expect(saveBtn).toBeVisible({ timeout: 10000 });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    CommonHelper.logger('STEP', 'Service Save clicked');
    await this.page.waitForTimeout(2000);
  }

  private async captureServiceDetails(): Promise<ServiceDetails> {
    await this.page.waitForTimeout(2000);
    
    // Extract service number from the URL if possible
    let serviceNumber = '';
    let deadline = '';
    const url = this.page.url();
    const serviceIdMatch = url.match(/\/projects\/view\/(\d+)/);
    if (serviceIdMatch) {
      serviceNumber = serviceIdMatch[1];
    }
    
    // Extract deadline from the deadline input field
    const deadlineInput = this.page.locator('input#deadline');
    if (await deadlineInput.count()) {
      deadline = await deadlineInput.inputValue();
      if (!deadline) {
        // Fallback to the value set before Save
        deadline = this.deadlineBefore;
      }
    }
    
    CommonHelper.logger('INFO', 'Service created - Number:', serviceNumber, 'Name:', this.selectedServiceName, 'Deadline:', deadline);
    return { serviceNumber, serviceName: this.selectedServiceName, deadline };
  }
}
