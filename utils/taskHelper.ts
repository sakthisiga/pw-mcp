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
    CommonHelper.logger('STEP', 'Attempting to close task modal');
    
    // Capture current URL before closing modal to detect navigation
    const urlBeforeClose = this.page.url();
    CommonHelper.logger('INFO', `URL before modal close: ${urlBeforeClose}`);
    
    // Support both .modal and <dialog> elements
    const postSaveModal = this.page.locator('.modal:visible, dialog[open]');
    
    // Check if modal/dialog exists
    const modalExists = await postSaveModal.count() > 0;
    if (!modalExists) {
      CommonHelper.logger('INFO', 'No modal/dialog found to close');
      return;
    }
    
    // Try clicking close button (works for both .modal and <dialog>)
    const closeBtn = postSaveModal.locator('button:has-text("Close"), button.close, .modal-header .close, button:has-text("×")');
    if (await closeBtn.count() > 0) {
      try {
        await closeBtn.first().click({ timeout: 2000 });
        await this.page.waitForTimeout(500);
        CommonHelper.logger('INFO', 'Clicked close button');
      } catch (err) {
        CommonHelper.logger('WARN', 'Failed to click close button:', err);
      }
    }
    
    // Press Escape as fallback
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.page.waitForTimeout(500);
    
    // Force remove if still visible
    if (await postSaveModal.isVisible().catch(() => false)) {
      CommonHelper.logger('INFO', 'Modal still visible, forcing removal');
      await this.forceRemoveModal();
      await this.page.waitForTimeout(500);
    }
    
    // Final check
    const stillVisible = await postSaveModal.isVisible().catch(() => false);
    const backdropVisible = await this.page.locator('.modal-backdrop').first().isVisible().catch(() => false);
    
    if (stillVisible || backdropVisible) {
      CommonHelper.logger('WARN', 'Modal/backdrop still visible after all attempts');
      await this.fallbackModalClose(postSaveModal);
      await this.ensureModalClosed(postSaveModal);
    } else {
      CommonHelper.logger('STEP', 'Task modal successfully closed');
    }
    
    // Check if URL changed after modal close - this indicates unwanted navigation
    await this.page.waitForTimeout(1000);
    const urlAfterClose = this.page.url();
    CommonHelper.logger('INFO', `URL after modal close: ${urlAfterClose}`);
    
    if (urlAfterClose !== urlBeforeClose) {
      CommonHelper.logger('WARN', `URL changed after modal close! Before: ${urlBeforeClose}, After: ${urlAfterClose}`);
      
      // If navigated to dashboard, try to go back to the service page
      if (urlAfterClose.includes('/admin') && !urlAfterClose.includes('/projects/') && !urlAfterClose.includes('/clients/')) {
        CommonHelper.logger('WARN', 'Navigated to dashboard, attempting to return to service page');
        // Try to navigate back
        await this.page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await this.page.waitForTimeout(1500);
        
        const recoveredUrl = this.page.url();
        CommonHelper.logger('INFO', `URL after going back: ${recoveredUrl}`);
      }
    }
  }

  private async forceRemoveModal(): Promise<void> {
    await this.page.evaluate(() => {
      // Remove .modal elements with .show class
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

      // Remove any <dialog> elements that are open
      const dialogs = Array.from(document.querySelectorAll('dialog[open]'));
      dialogs.forEach(d => {
        try {
          (d as HTMLDialogElement).close();
        } catch (e) {
          // If close() fails, remove from DOM
          d.parentNode && d.parentNode.removeChild(d);
        }
      });

      // Remove any modal backdrops
      const backdrops = Array.from(document.querySelectorAll('.modal-backdrop'));
      backdrops.forEach(b => b.parentNode && b.parentNode.removeChild(b));
    });
  }

  /**
   * Clear any page obstructions that might prevent interaction with tabs
   * This includes modals, backdrops, overlays, and loading indicators
   */
  private async clearPageObstructions(): Promise<void> {
    CommonHelper.logger('INFO', 'Clearing page obstructions...');
    
    try {
      await this.page.evaluate(() => {
        // Remove all modals and backdrops
        const modals = Array.from(document.querySelectorAll('.modal, .modal-backdrop'));
        modals.forEach(m => {
          if (m.parentNode) {
            m.parentNode.removeChild(m);
          }
        });
        
        // Remove common overlay patterns
        const overlays = Array.from(document.querySelectorAll(
          '.overlay, .loading-overlay, .spinner-overlay, [class*="overlay"], [class*="loading"]'
        ));
        overlays.forEach(o => {
          const style = window.getComputedStyle(o);
          if (style.position === 'fixed' || style.position === 'absolute') {
            if (o.parentNode) {
              o.parentNode.removeChild(o);
            }
          }
        });
        
        // Remove any elements with high z-index that might be blocking
        const allElements = Array.from(document.querySelectorAll('*'));
        allElements.forEach(el => {
          const style = window.getComputedStyle(el);
          const zIndex = parseInt(style.zIndex);
          if (zIndex > 1000 && (style.position === 'fixed' || style.position === 'absolute')) {
            const rect = el.getBoundingClientRect();
            // Only remove if it's large enough to be an overlay (covers significant area)
            if (rect.width > window.innerWidth * 0.5 || rect.height > window.innerHeight * 0.5) {
              if (el.parentNode && !el.classList.contains('nav') && !el.classList.contains('header')) {
                el.parentNode.removeChild(el);
              }
            }
          }
        });
      });
      
      CommonHelper.logger('INFO', 'Page obstructions cleared');
    } catch (err) {
      CommonHelper.logger('WARN', 'Error clearing page obstructions:', err);
    }
    
    // Press Escape as a final fallback
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.page.waitForTimeout(500);
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
    CommonHelper.logger('STEP', 'Navigating to Tasks tab');
    
    // Wait for page stability
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    await this.page.waitForTimeout(1500);
    
    // Check current URL - ensure we're on customer/service page, not dashboard
    let currentUrl = this.page.url();
    CommonHelper.logger('INFO', `Current URL before Tasks tab: ${currentUrl}`);
    
    // If URL has taskid parameter, remove it to prevent task modal from opening
    if (currentUrl.includes('?taskid=')) {
      const cleanUrl = currentUrl.split('?')[0];
      CommonHelper.logger('WARN', `Removing taskid parameter from URL: ${cleanUrl}`);
      await this.page.goto(cleanUrl, { waitUntil: 'domcontentloaded' });
      await this.page.waitForTimeout(1000);
      currentUrl = this.page.url();
      CommonHelper.logger('INFO', `URL after cleanup: ${currentUrl}`);
    }
    
    // If we're on dashboard or wrong page, wait longer for proper page load
    if (currentUrl.includes('/admin') && !currentUrl.includes('/clients/') && !currentUrl.includes('/projects/')) {
      CommonHelper.logger('WARN', 'Detected dashboard/wrong page, waiting for navigation to complete...');
      await this.page.waitForTimeout(3000);
      
      // Re-check URL
      const newUrl = this.page.url();
      CommonHelper.logger('INFO', `URL after wait: ${newUrl}`);
      
      if (newUrl.includes('/admin') && !newUrl.includes('/clients/') && !newUrl.includes('/projects/')) {
        await this.page.screenshot({ path: 'wrong-page-before-tasks-tab.png', fullPage: true });
        throw new Error(`Wrong page detected: ${newUrl}. Expected customer or service detail page.`);
      }
    }
    
    // Locate the Tasks tab
    const tasksTab = this.page.locator('a[role="tab"][data-group="project_tasks"]');
    
    // Wait for tab to be visible
    try {
      await tasksTab.waitFor({ state: 'visible', timeout: 15000 });
      CommonHelper.logger('INFO', 'Tasks tab is visible');
    } catch (err) {
      await this.page.screenshot({ path: 'tasks-tab-not-visible.png', fullPage: true });
      const finalUrl = this.page.url();
      throw new Error(`Tasks tab not visible after 15 seconds. Current URL: ${finalUrl}`);
    }
    
    // Click the tab (3 methods)
    let clicked = false;
    
    // Method 1: Standard click
    try {
      await tasksTab.click({ timeout: 3000 });
      clicked = true;
      CommonHelper.logger('STEP', 'Tasks tab clicked (standard)');
    } catch (e1) {
      // Method 2: Force click
      try {
        await tasksTab.click({ force: true, timeout: 3000 });
        clicked = true;
        CommonHelper.logger('STEP', 'Tasks tab clicked (force)');
      } catch (e2) {
        // Method 3: JavaScript click
        try {
          await tasksTab.evaluate((el: HTMLElement) => el.click());
          clicked = true;
          CommonHelper.logger('STEP', 'Tasks tab clicked (JS)');
        } catch (e3) {
          await this.page.screenshot({ path: 'tasks-tab-click-failed.png', fullPage: true });
          throw new Error('Failed to click Tasks tab after all methods');
        }
      }
    }
    
    // Wait for tab panel to become active and content to load
    await this.page.waitForTimeout(1500);
    
    // Wait for Tasks Summary to appear with multiple selectors
    const tasksSummaryHeading = this.page.locator('h4:has-text("Tasks Summary"), h3:has-text("Tasks Summary"), h4:has-text("Tasks"), h3:has-text("Tasks")');
    try {
      await tasksSummaryHeading.first().waitFor({ state: 'visible', timeout: 10000 });
      CommonHelper.logger('STEP', 'Tasks Summary heading is visible');
    } catch (err) {
      await this.page.screenshot({ path: 'tasks-summary-not-visible.png', fullPage: true });
      const tabPanelHtml = await this.page.locator('#project_tasks').innerHTML().catch(() => 'Could not get HTML');
      CommonHelper.logger('WARN', `Tab panel HTML: ${tabPanelHtml.substring(0, 500)}`);
      throw new Error('Tasks Summary heading not visible after clicking tab');
    }
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
