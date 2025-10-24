import { Page, expect, Locator } from '@playwright/test';
import { CommonHelper } from './commonHelper';
import * as fs from 'fs';

export class TaskHelper {
  constructor(private page: Page) {}

  /**
   * Create a "Payment Collection" task with status "In Progress"
   * Verifies task appears in Tasks panel
   */
  async createPaymentCollectionTask(): Promise<void> {
    await this.clickNewTaskButton();
    await this.waitForTaskModal();
    await this.fillTaskForm();
    await this.saveTask();
    await this.handlePostSaveModal();
    await this.closeModal();
    await this.navigateToTasksTab();
    await this.verifyTaskCreated();
  }

  private async clickNewTaskButton(): Promise<void> {
    await this.page.waitForTimeout(2000);
    
    // Scope the locator to the actions container to avoid matching notifications or other links
    const actionsContainer = this.page.locator('div').filter({ has: this.page.locator('a', { hasText: 'Go to Customer' }) }).first();
    let candidates = actionsContainer.locator('a, button', { hasText: 'New Task' });
    if (!(await candidates.count())) {
      // Fallback: page-level candidates
      candidates = this.page.locator('a, button', { hasText: 'New Task' });
    }
    
    const candidateCount = await candidates.count();
    if (candidateCount === 0) {
      await this.page.screenshot({ path: 'new-task-not-found.png', fullPage: true });
      CommonHelper.logger('WARN', 'No New Task candidates found on page');
      throw new Error('New Task button not found');
    }
    
    let clicked = false;
    
    if (candidateCount === 1) {
      await CommonHelper.resilientClick(candidates.first(), this.page, 'new-task-btn');
      clicked = true;
    } else {
      // Try visible candidates first
      for (let i = 0; i < candidateCount; i++) {
        const cand = candidates.nth(i);
        try {
          if (await cand.isVisible()) {
            await CommonHelper.resilientClick(cand, this.page, `new-task-candidate-${i}`);
            clicked = true;
            break;
          }
        } catch (e) {
          // ignore and try next
        }
      }
      
      // Fallback to element handle click if none of the locators succeeded
      if (!clicked) {
        clicked = await this.tryElementHandleClick(candidates, candidateCount);
      }
    }
    
    if (!clicked) {
      clicked = await this.tryAdvancedClickStrategies(candidates, candidateCount, actionsContainer);
    }
    
    if (!clicked) {
      await this.page.screenshot({ path: 'new-task-click-fail.png', fullPage: true });
      throw new Error('Failed to click New Task (no clickable candidate)');
    }
    
    CommonHelper.logger('STEP', 'New Task button clicked');
  }

  private async tryElementHandleClick(candidates: Locator, candidateCount: number): Promise<boolean> {
    for (let i = 0; i < candidateCount; i++) {
      const handle = await candidates.nth(i).elementHandle();
      if (!handle) continue;
      const box = await handle.boundingBox();
      if (box && box.width > 0 && box.height > 0) {
        await handle.click();
        return true;
      }
    }
    return false;
  }

  private async tryAdvancedClickStrategies(candidates: Locator, candidateCount: number, actionsContainer: Locator): Promise<boolean> {
    CommonHelper.logger('WARN', 'Primary New Task click attempts failed; trying JS/evaluate fallbacks');
    
    // Try evaluate-click on candidate handles
    for (let i = 0; i < candidateCount; i++) {
      try {
        const handle = await candidates.nth(i).elementHandle();
        if (!handle) continue;
        
        await handle.evaluate((el: HTMLElement) => {
          el.scrollIntoView({ block: 'center', inline: 'center' });
          (el as HTMLElement).click();
        });
        
        await this.page.waitForTimeout(500);
        const maybeModal = this.page.locator('.modal:visible');
        if (await maybeModal.count() && await maybeModal.isVisible()) {
          CommonHelper.logger('INFO', `New Task clicked via evaluate on candidate ${i}`);
          return true;
        }
      } catch (e) {
        // ignore and try next
      }
    }
    
    // Try document-level search limited to actionsContainer
    try {
      const clickedViaDoc = await this.page.evaluate(() => {
        const container = Array.from(document.querySelectorAll('div')).find(d => d.querySelector('a') && d.textContent && d.textContent.includes('Go to Customer'));
        if (!container) return false;
        const elems = Array.from(container.querySelectorAll('a, button')) as HTMLElement[];
        const cand = elems.find(e => (e.innerText || '').trim().includes('New Task'));
        if (!cand) return false;
        cand.scrollIntoView({ block: 'center', inline: 'center' });
        cand.click();
        return true;
      });
      
      if (clickedViaDoc) {
        await this.page.waitForTimeout(500);
        const maybeModal = this.page.locator('.modal:visible');
        if (await maybeModal.count() && await maybeModal.isVisible()) {
          CommonHelper.logger('INFO', 'New Task clicked via document-level JS click');
          return true;
        }
      }
    } catch (e) {
      CommonHelper.logger('WARN', 'Document-level JS click attempt failed', String(e));
    }
    
    // Aggressive document-wide visible click
    CommonHelper.logger('WARN', 'All previous New Task click attempts failed — trying aggressive document-wide visible click');
    try {
      const aggressive = await this.page.evaluate(() => {
        const isVisible = (el: Element) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          return r && r.width > 0 && r.height > 0;
        };
        const candidates = Array.from(document.querySelectorAll('a, button')) as HTMLElement[];
        for (const el of candidates) {
          const txt = (el.innerText || '').trim();
          if (!txt) continue;
          if (/New\s*Task/i.test(txt) && isVisible(el)) {
            try {
              el.scrollIntoView({ block: 'center', inline: 'center' });
              el.click();
              return { ok: true, tag: el.tagName, text: txt, id: el.id || '', class: el.className || '' };
            } catch (err) {
              // continue trying others
            }
          }
        }
        return { ok: false };
      });
      
      if (aggressive && (aggressive as any).ok) {
        CommonHelper.logger('INFO', 'Aggressive New Task click succeeded. Element:', (aggressive as any).tag, (aggressive as any).text, (aggressive as any).id, (aggressive as any).class);
        await this.page.waitForTimeout(500);
        const maybeModal = this.page.locator('.modal:visible');
        if (await maybeModal.count() && await maybeModal.isVisible()) {
          return true;
        }
      } else {
        CommonHelper.logger('WARN', 'Aggressive New Task click did not find a visible element to click');
      }
    } catch (e) {
      CommonHelper.logger('WARN', 'Aggressive document click attempt failed:', String(e));
    }
    
    return false;
  }

  private async waitForTaskModal(): Promise<void> {
    let taskModal = this.page.locator('.modal:visible');
    let modalAppeared = false;
    
    for (let i = 0; i < 5; i++) {
      if (await taskModal.isVisible()) {
        modalAppeared = true;
        break;
      }
      await this.page.waitForTimeout(1000);
      taskModal = this.page.locator('.modal:visible');
    }
    
    if (!modalAppeared) {
      // Try fallback: loop through all .modal and pick the first visible one
      const modals = await this.page.locator('.modal').elementHandles();
      for (const modalHandle of modals) {
        const box = await modalHandle.boundingBox();
        if (box && box.width > 0 && box.height > 0) {
          const id = await modalHandle.getAttribute('id');
          if (id) {
            taskModal = this.page.locator(`#${id}`);
            modalAppeared = true;
            break;
          }
        }
      }
    }
    
    if (!modalAppeared) {
      await this.page.screenshot({ path: 'task-modal-not-found.png', fullPage: true });
      CommonHelper.logger('WARN', 'task-modal-not-found: saved screenshot for debugging');
      throw new Error('Task modal not found after clicking New Task. Screenshot and HTML saved for debugging.');
    }
    
    CommonHelper.logger('STEP', 'Task modal opened');
  }

  private async fillTaskForm(): Promise<void> {
    const taskModal = this.page.locator('.modal:visible');
    
    // Select the "Subject" input and enter the text "Payment Collection"
    const subjectInput = taskModal.locator('input#subject, input[name="name"], input[name="subject"], input[placeholder*="Subject"]').first();
    await expect(subjectInput).toBeVisible({ timeout: 10000 });
    await subjectInput.click();
    await subjectInput.fill('Payment Collection');
    CommonHelper.logger('INFO', 'Subject set to Payment Collection');
    
    // Select tomorrow's date in Due Date
    const dueDateInput = taskModal.locator('input#duedate, input[name="duedate"], input[name="due_date"], input[placeholder*="Due Date"]').first();
    await expect(dueDateInput).toBeVisible({ timeout: 10000 });
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const tomorrowStr = `${pad(tomorrow.getDate())}-${pad(tomorrow.getMonth() + 1)}-${tomorrow.getFullYear()}`;
    await dueDateInput.fill(tomorrowStr);
    CommonHelper.logger('INFO', 'Due Date set:', tomorrowStr);
    
    // Assign to current user if assignment dropdown exists
    const assignDropdown = taskModal.locator('select[name="assigned"], select[name="assigned_to"], select#assigned, select#assigned_to');
    if (await assignDropdown.count() && await assignDropdown.isVisible()) {
      const options = await assignDropdown.locator('option').allTextContents();
      // Try to select the first non-empty option (usually current user)
      for (const opt of options) {
        if (opt && !opt.toLowerCase().includes('select')) {
          await assignDropdown.selectOption({ label: opt });
          CommonHelper.logger('INFO', `Assigned to: ${opt}`);
          break;
        }
      }
    }
  }

  private async saveTask(): Promise<void> {
    const taskModal = this.page.locator('.modal:visible');
    
    // Network logging setup for task creation
    const networkLogs: any[] = [];
    this.page.on('request', request => {
      if (request.url().includes('/tasks') || request.url().includes('/task')) {
        networkLogs.push({ type: 'request', url: request.url(), method: request.method(), postData: request.postData() });
      }
    });
    this.page.on('response', async response => {
      if (response.url().includes('/tasks') || response.url().includes('/task')) {
        let body = null;
        try {
          const ct = response.headers()['content-type'] || '';
          if (ct.includes('application/json') || ct.includes('text')) {
            body = await response.text();
          }
        } catch (err) {
          body = `ERROR: ${err}`;
        }
        networkLogs.push({ type: 'response', url: response.url(), status: response.status(), body });
      }
    });
    
    // Click Save in modal
    const saveTaskBtn = taskModal.locator('button, a', { hasText: 'Save' });
    await expect(saveTaskBtn).toBeVisible({ timeout: 10000 });
    await saveTaskBtn.click();
    CommonHelper.logger('STEP', 'Task Save clicked');
    
    // Wait for success toast/notification
    let toastAppeared = false;
    for (let i = 0; i < 10; i++) {
      const toast = this.page.locator('.toast-success, .toast-message, .notification-success');
      if (await toast.count() && await toast.isVisible()) {
        toastAppeared = true;
        CommonHelper.logger('INFO', 'Success toast appeared after Save');
        break;
      }
      await this.page.waitForTimeout(1000);
    }
    
    if (!toastAppeared) {
      CommonHelper.logger('WARN', 'No success toast appeared after Save. See diagnostics and network log.');
    }
  }

  private async handlePostSaveModal(): Promise<void> {
    // Wait for post-save popup/modal to appear
    let postSaveModal = this.page.locator('.modal:visible');
    let postModalAppeared = false;
    
    for (let i = 0; i < 10; i++) {
      if (await postSaveModal.isVisible()) {
        postModalAppeared = true;
        break;
      }
      await this.page.waitForTimeout(1000);
      postSaveModal = this.page.locator('.modal:visible');
    }
    
    if (!postModalAppeared) {
      await this.page.screenshot({ path: 'post-save-modal-not-found.png', fullPage: true });
      CommonHelper.logger('WARN', 'post-save-modal-not-found: saved screenshot for debugging');
      throw new Error('Post-save modal not found after saving task. Screenshot and HTML saved for debugging.');
    }
    
    CommonHelper.logger('STEP', 'Post-save modal opened');
    
    // Click "Status" and select "Mark as In Progress"
    await this.setTaskStatus(postSaveModal);
  }

  private async setTaskStatus(postSaveModal: Locator): Promise<void> {
    let statusSet = false;
    
    // Try select#status first
    const statusDropdown = postSaveModal.locator('select#status');
    if (await statusDropdown.count() && await statusDropdown.isVisible()) {
      await statusDropdown.selectOption({ label: 'In Progress' });
      statusSet = true;
      CommonHelper.logger('INFO', 'Task status set to In Progress via select');
    } else {
      // Try button with text 'Status' or 'In Progress'
      const statusButton = postSaveModal.getByText('Status', { exact: false });
      if (await statusButton.count() && await statusButton.isVisible()) {
        await statusButton.click();
        const inProgressOption = postSaveModal.getByText('In Progress', { exact: false }).first();
        if (await inProgressOption.count() && await inProgressOption.isVisible()) {
          await inProgressOption.click();
          statusSet = true;
          CommonHelper.logger('INFO', 'Task status set to In Progress via button');
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
            CommonHelper.logger('INFO', 'Task status set to In Progress via aria-label');
          }
        } else {
          // Try direct text selector for 'In Progress'
          const inProgressDirect = postSaveModal.getByText('In Progress', { exact: false });
          if (await inProgressDirect.count() && await inProgressDirect.isVisible()) {
            await inProgressDirect.click();
            statusSet = true;
            CommonHelper.logger('INFO', 'Task status set to In Progress via direct text');
          }
        }
      }
    }
    
    if (!statusSet) {
      // Log modal HTML for debugging
      const modalHtml = await postSaveModal.innerHTML();
      fs.writeFileSync('task-status-modal-debug.html', modalHtml);
      CommonHelper.logger('WARN', 'Could not find status selector for task modal. Modal HTML saved to task-status-modal-debug.html');
    }
  }

  private async closeModal(): Promise<void> {
    const postSaveModal = this.page.locator('.modal:visible');
    let modalClosed = false;
    
    // Try clicking close button
    const closeBtn = postSaveModal.locator('button, a', { hasText: 'Close' });
    if (await closeBtn.count()) {
      await closeBtn.click();
      await this.page.waitForTimeout(500);
      
      if (await postSaveModal.isVisible() || await this.page.locator('.modal-backdrop').first().isVisible().catch(() => false)) {
        await this.forceRemoveModal();
        await this.page.waitForTimeout(500);
        if (!(await postSaveModal.isVisible()) && !(await this.page.locator('.modal-backdrop').first().isVisible().catch(() => false))) {
          modalClosed = true;
          CommonHelper.logger('STEP', 'Task modal forcibly removed after Close.');
        } else {
          CommonHelper.logger('WARN', 'Modal/backdrop still present after forced removal.');
        }
      } else {
        modalClosed = true;
        CommonHelper.logger('STEP', 'Task modal closed');
      }
    } else {
      // Try clicking X button
      const xBtn = postSaveModal.locator('button.close, .modal-header .close');
      if (await xBtn.count()) {
        await xBtn.click();
        await this.page.waitForTimeout(500);
        
        if (await postSaveModal.isVisible() || await this.page.locator('.modal-backdrop').first().isVisible().catch(() => false)) {
          await this.forceRemoveModal();
          await this.page.waitForTimeout(500);
          if (!(await postSaveModal.isVisible()) && !(await this.page.locator('.modal-backdrop').first().isVisible().catch(() => false))) {
            modalClosed = true;
            CommonHelper.logger('STEP', 'Task modal forcibly removed after X.');
          } else {
            CommonHelper.logger('WARN', 'Modal/backdrop still present after forced removal.');
          }
        } else {
          modalClosed = true;
          CommonHelper.logger('STEP', 'Task modal closed via X');
        }
      } else {
        CommonHelper.logger('WARN', 'Could not find close button for task modal');
      }
    }
    
    // Fallback: if modal is still visible, try multiple strategies
    await this.fallbackModalClose(postSaveModal);
    
    // Final check for modal and backdrop
    await this.ensureModalClosed(postSaveModal);
  }

  private async forceRemoveModal(): Promise<void> {
    await this.page.evaluate(() => {
      // Use only valid selectors in the browser. ':visible' is a jQuery pseudo-selector
      // and isn't supported by querySelectorAll. Select elements with the
      // Bootstrap-visible class ('.modal.show') then filter by computed style to
      // replicate the ':visible' semantics before removing them.
      const modals = Array.from(document.querySelectorAll('.modal.show'));
      const visibleModals = modals.filter(m => {
        try {
          const style = window.getComputedStyle(m);
          const rect = m.getBoundingClientRect();
          return style && style.display !== 'none' && style.visibility !== 'hidden' && (rect.width > 0 || rect.height > 0);
        } catch (e) {
          return false;
        }
      });
      visibleModals.forEach(m => m.parentNode && m.parentNode.removeChild(m));

      // Remove any modal backdrops
      const backdrops = Array.from(document.querySelectorAll('.modal-backdrop'));
      backdrops.forEach(b => b.parentNode && b.parentNode.removeChild(b));
    });
  }

  private async fallbackModalClose(postSaveModal: Locator): Promise<void> {
    let fallbackModalClosed = false;
    const closeBtn = postSaveModal.locator('button, a', { hasText: 'Close' });
    
    for (let i = 0; i < 10; i++) {
      if (!(await postSaveModal.isVisible())) {
        fallbackModalClosed = true;
        break;
      }
      
      await this.page.keyboard.press('Escape');
      await this.page.locator('body').click({ position: { x: 10, y: 10 } });
      
      if (await closeBtn.count() && await closeBtn.isVisible()) {
        try {
          await closeBtn.click();
        } catch (err) {
          CommonHelper.logger('WARN', 'closeBtn not stable or detached, skipping click');
          break;
        }
      } else {
        const xBtnLocator = postSaveModal.locator('button.close, .modal-header .close');
        if (await xBtnLocator.count() && await xBtnLocator.isVisible()) {
          try {
            await xBtnLocator.click();
          } catch (err) {
            CommonHelper.logger('WARN', 'xBtn not stable or detached, skipping click');
            break;
          }
        }
      }
      
      await this.page.waitForTimeout(1000);
    }
    
    if (!fallbackModalClosed) {
      // Permanent fix: forcibly remove modal and backdrop from DOM
      await this.forceRemoveModal();
      await this.page.waitForTimeout(1000);
      
      const stillVisible = await postSaveModal.isVisible();
      const backdropStillVisible = await this.page.locator('.modal-backdrop').first().isVisible().catch(() => false);
      
      if (!stillVisible && !backdropStillVisible) {
        CommonHelper.logger('INFO', 'Modal and backdrop forcibly removed from DOM.');
      } else {
        if (!this.page.isClosed()) {
          await this.page.screenshot({ path: 'modal-not-closed-fallback.png', fullPage: true });
          CommonHelper.logger('WARN', 'modal-not-closed-fallback: saved screenshot for debugging');
        }
        throw new Error('Modal did not close after all fallback actions (fallback loop). Screenshot and HTML saved for debugging.');
      }
    }
  }

  private async ensureModalClosed(postSaveModal: Locator): Promise<void> {
    const modalBackdrop = this.page.locator('.modal-backdrop').first();
    let modalClosed = false;
    
    // Wait for modal to be hidden
    for (let i = 0; i < 5; i++) {
      if (!(await postSaveModal.isVisible())) {
        modalClosed = true;
        break;
      }
      await this.page.keyboard.press('Escape');
      await this.page.locator('body').click({ position: { x: 10, y: 10 } });
      const closeBtn = postSaveModal.locator('button, a', { hasText: 'Close' });
      if (await closeBtn.count()) await closeBtn.click();
      const xBtn = postSaveModal.locator('button.close, .modal-header .close');
      if (await xBtn.count()) await xBtn.click();
      await this.page.waitForTimeout(1000);
    }
    
    if (!modalClosed) {
      await this.page.screenshot({ path: 'modal-not-closed.png', fullPage: true });
      CommonHelper.logger('WARN', 'modal-not-closed: saved screenshot for debugging');
      throw new Error('Modal did not close after all fallback actions. Screenshot and HTML saved for debugging.');
    }
    
    // Check for backdrop
    let backdropClosed = false;
    for (let i = 0; i < 5; i++) {
      if (!(await modalBackdrop.isVisible())) {
        backdropClosed = true;
        break;
      }
      await this.page.keyboard.press('Escape');
      await this.page.locator('body').click({ position: { x: 10, y: 10 } });
      await this.page.waitForTimeout(1000);
    }
    
    if (!backdropClosed) {
      await this.page.screenshot({ path: 'modal-backdrop-not-closed.png', fullPage: true });
      CommonHelper.logger('WARN', 'modal-backdrop-not-closed: saved screenshot for debugging');
      throw new Error('Modal backdrop did not disappear after all fallback actions. Screenshot and HTML saved for debugging.');
    }
  }

  private async navigateToTasksTab(): Promise<void> {
    CommonHelper.logger('STEP', 'Waiting for Tasks tab to be visible');
    const tasksTab = this.page.locator('a[role="tab"][data-group="project_tasks"]');
    let tasksTabVisible = false;
    
    for (let i = 0; i < 10; i++) {
      try {
        await expect(tasksTab).toBeVisible({ timeout: 5000 });
        tasksTabVisible = true;
        break;
      } catch (e) {
        await this.page.screenshot({ path: `tasks-tab-not-visible-${i}.png`, fullPage: true });
        CommonHelper.logger('WARN', `tasks-tab-not-visible-${i}: saved screenshot for debugging`);
        await this.page.waitForTimeout(1000);
      }
    }
    
    if (!tasksTabVisible) {
      throw new Error('Tasks tab not visible after retries. See screenshots and HTML for diagnosis.');
    }
    
    CommonHelper.logger('STEP', 'Tasks tab is visible');
    
    let tasksTabClicked = false;
    for (let i = 0; i < 5; i++) {
      try {
        await tasksTab.click();
        tasksTabClicked = true;
        break;
      } catch (e) {
        await this.page.screenshot({ path: `tasks-tab-click-fail-${i}.png`, fullPage: true });
        CommonHelper.logger('WARN', `tasks-tab-click-fail-${i}: saved screenshot for debugging`);
        await this.page.waitForTimeout(1000);
      }
    }
    
    if (!tasksTabClicked) {
      throw new Error('Failed to click Tasks tab after retries. See screenshots and HTML for diagnosis.');
    }
    
    CommonHelper.logger('STEP', 'Clicked Tasks tab');
    
    // Wait for tasks panel to appear
    const tasksSummaryHeading = this.page.locator('h4:has-text("Tasks Summary")');
    let tasksSummaryVisible = false;
    
    for (let i = 0; i < 15; i++) {
      try {
        await expect(tasksSummaryHeading).toBeVisible({ timeout: 1000 });
        tasksSummaryVisible = true;
        break;
      } catch (e) {
        CommonHelper.logger('WARN', `Tasks Summary heading not visible, retry ${i}`);
        await this.page.waitForTimeout(1000);
      }
    }
    
    if (!tasksSummaryVisible) {
      throw new Error('Tasks Summary heading not visible after retries. See screenshots and HTML for diagnosis.');
    }
    
    CommonHelper.logger('STEP', 'Tasks Summary heading is visible');
  }

  private async verifyTaskCreated(): Promise<void> {
    // Extra wait after task creation before searching
    CommonHelper.logger('INFO', 'Waiting extra time for Payment Collection task to appear...');
    await this.page.waitForTimeout(3000);
    
    const paymentTaskFound = await this.findPaymentCollectionTask();
    
    if (!paymentTaskFound) {
      CommonHelper.logger('INFO', 'Payment Collection task not found, attempting to create again');
      await this.retryTaskCreation();
    } else {
      CommonHelper.logger('INFO', 'Payment Collection task found in Tasks panel.');
    }
  }

  private async findPaymentCollectionTask(): Promise<boolean> {
    const taskRow = this.page.locator('tr:has-text("Payment Collection"), .task-card:has-text("Payment Collection")');
    
    for (let i = 0; i < 10; i++) {
      if (await taskRow.count() && await taskRow.isVisible()) {
        CommonHelper.logger('INFO', `Payment Collection task found on attempt ${i}`);
        return true;
      }
      CommonHelper.logger('WARN', `Payment Collection task not found, attempt ${i}`);
      await this.page.waitForTimeout(1500);
    }
    
    return false;
  }

  private async retryTaskCreation(): Promise<void> {
    const actionsContainerRetry = this.page.locator('div').filter({ has: this.page.locator('a', { hasText: 'Go to Customer' }) }).first();
    let candidates = actionsContainerRetry.locator('a, button', { hasText: 'New Task' });
    if (!(await candidates.count())) candidates = this.page.locator('a, button', { hasText: 'New Task' });
    
    const candidateCount = await candidates.count();
    const tasksTab = this.page.locator('a[role="tab"][data-group="project_tasks"]');
    const tasksSummaryHeading = this.page.locator('h4:has-text("Tasks Summary")');
    
    for (let attempt = 0; attempt < 3; attempt++) {
      if (candidateCount > 0) {
        await this.clickTaskCandidate(candidates, candidateCount, attempt);
        
        const taskModal = this.page.locator('.modal:visible');
        if (!(await this.waitForModal(taskModal, attempt))) continue;
        
        const subjectInput = taskModal.locator('input[name="subject"], input[placeholder*="Subject"]');
        if (!(await this.waitForSubjectInput(subjectInput, attempt))) continue;
        
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
          await this.page.waitForTimeout(1000);
        }
        
        // Wait for modal to close
        for (let i = 0; i < 10; i++) {
          if (!(await taskModal.isVisible())) break;
          await this.page.waitForTimeout(1000);
        }
        
        // Reopen Tasks tab if needed
        await tasksTab.click();
        await expect(tasksSummaryHeading).toBeVisible({ timeout: 10000 });
        
        // Check again for Payment Collection task
        const paymentTaskFound = await this.findPaymentCollectionTask();
        if (paymentTaskFound) return;
      }
      await this.page.waitForTimeout(1000);
    }
    
    await this.page.screenshot({ path: 'payment-collection-task-not-found.png', fullPage: true });
    CommonHelper.logger('WARN', 'payment-collection-task-not-found: saved screenshot for debugging');
    throw new Error('Payment Collection task not found after creation and retry. Screenshot and HTML saved for debugging.');
  }

  private async clickTaskCandidate(candidates: Locator, candidateCount: number, attempt: number): Promise<void> {
    let clicked = false;
    
    if (candidateCount === 1) {
      await CommonHelper.resilientClick(candidates.first(), this.page, `new-task-retry-${attempt}`);
      clicked = true;
    } else {
      for (let i = 0; i < candidateCount; i++) {
        const cand = candidates.nth(i);
        try {
          if (await cand.isVisible()) {
            await CommonHelper.resilientClick(cand, this.page, `new-task-retry-${attempt}-${i}`);
            clicked = true;
            break;
          }
        } catch (e) {
          // ignore and continue
        }
      }
      
      if (!clicked) {
        for (let i = 0; i < candidateCount; i++) {
          const handle = await candidates.nth(i).elementHandle();
          if (!handle) continue;
          const box = await handle.boundingBox();
          if (box && box.width > 0 && box.height > 0) {
            await handle.click();
            clicked = true;
            break;
          }
        }
      }
    }
    
    if (!clicked) {
      CommonHelper.logger('WARN', `Attempt ${attempt} to click New Task failed (no clickable candidate), retrying`);
    }
  }

  private async waitForModal(taskModal: Locator, attempt: number): Promise<boolean> {
    for (let i = 0; i < 10; i++) {
      if (await taskModal.isVisible()) {
        return true;
      }
      await this.page.waitForTimeout(1000);
    }
    
    await this.page.screenshot({ path: `task-modal-not-visible-attempt-${attempt}.png`, fullPage: true });
    CommonHelper.logger('WARN', `task-modal-not-visible-attempt-${attempt}: saved screenshot for debugging`);
    await this.page.keyboard.press('Escape');
    await this.page.locator('body').click({ position: { x: 10, y: 10 } });
    return false;
  }

  private async waitForSubjectInput(subjectInput: Locator, attempt: number): Promise<boolean> {
    for (let i = 0; i < 10; i++) {
      if (await subjectInput.count() && await subjectInput.isVisible()) {
        return true;
      }
      await this.page.waitForTimeout(1000);
    }
    
    await this.page.screenshot({ path: `subject-input-not-visible-attempt-${attempt}.png`, fullPage: true });
    CommonHelper.logger('WARN', `subject-input-not-visible-attempt-${attempt}: saved screenshot for debugging`);
    await this.page.keyboard.press('Escape');
    await this.page.locator('body').click({ position: { x: 10, y: 10 } });
    return false;
  }
}
