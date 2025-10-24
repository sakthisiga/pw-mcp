# Contributing to ABIS Playwright Test Suite

Thank you for your interest in contributing! This guide will help you understand the project structure and best practices.

## 🏗️ Architecture Overview

This project follows a **modular helper-based architecture** where complex workflows are encapsulated into reusable helper classes.

### Design Principles

1. **Separation of Concerns**: Each helper handles one specific business workflow
2. **DRY (Don't Repeat Yourself)**: Reusable components reduce code duplication
3. **Fail-Safe Design**: Multiple retry strategies and fallbacks for flaky UI elements
4. **Observable**: Comprehensive logging at every step for easy debugging
5. **Type Safety**: Full TypeScript support with proper interfaces

## 📁 Project Structure

```
utils/
├── commonHelper.ts       # Shared utilities (logging, resilient clicks, etc.)
├── loginHelper.ts        # Authentication workflow
├── leadHelper.ts         # Lead creation & management
├── proposalHelper.ts     # Proposal creation & approval
├── customerHelper.ts     # Customer conversion & admin assignment
├── serviceHelper.ts      # Service creation
├── taskHelper.ts         # Task creation with retry logic
├── proformaHelper.ts     # Proforma creation & acceptance
├── invoiceHelper.ts      # Invoice conversion, payment & approval
└── jsonWriteHelper.ts    # JSON file I/O operations
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- Playwright installed (`npm install`)
- Access to the ABIS application
- Environment variables configured in `.env`

### Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and configure:
   ```bash
   APP_BASE_URL=your_app_url
   E2E_USER=your_email
   E2E_PASS=your_password
   ```
4. Run tests: `npx playwright test`

## 🛠️ Creating a New Helper Class

When adding a new workflow, follow this pattern:

### 1. Create the Helper File

Create a new file in `utils/` directory (e.g., `utils/myWorkflowHelper.ts`):

```typescript
import { Page, expect } from '@playwright/test';
import { CommonHelper } from './commonHelper';
import { readAbisExecutionDetails, writeAbisExecutionDetails } from './jsonWriteHelper';

/**
 * MyWorkflowHelper - Brief description of what this helper does
 * 
 * Main Workflow:
 * 1. Step 1 description
 * 2. Step 2 description
 * 3. Step 3 description
 */
export class MyWorkflowHelper {
  constructor(private page: Page) {}

  /**
   * Main public method that orchestrates the workflow
   * @param param1 - Description of parameter
   * @returns Promise<void> or return type
   */
  async executeWorkflow(param1: string): Promise<void> {
    await this.step1();
    await this.step2();
    await this.step3();
    await this.captureResults();
  }

  /**
   * Private helper method for step 1
   */
  private async step1(): Promise<void> {
    CommonHelper.logger('STEP', 'Executing step 1');
    
    // Your implementation here
    const element = this.page.locator('selector');
    await expect(element).toBeVisible({ timeout: 10000 });
    await CommonHelper.resilientClick(element, this.page, 'element-name');
    
    CommonHelper.logger('INFO', 'Step 1 completed');
  }

  /**
   * Private helper method for step 2
   */
  private async step2(): Promise<void> {
    CommonHelper.logger('STEP', 'Executing step 2');
    // Implementation
  }

  /**
   * Private helper method for step 3
   */
  private async step3(): Promise<void> {
    CommonHelper.logger('STEP', 'Executing step 3');
    // Implementation
  }

  /**
   * Capture and save workflow results to JSON
   */
  private async captureResults(): Promise<void> {
    try {
      const detailsJson = readAbisExecutionDetails();
      detailsJson.myWorkflow = {
        // Capture relevant data
        id: 'extracted_value',
        status: 'success'
      };
      writeAbisExecutionDetails(detailsJson);
      CommonHelper.logger('INFO', 'Results captured successfully');
    } catch (err) {
      CommonHelper.logger('ERROR', 'Error capturing results:', err);
    }
  }
}
```

### 2. Key Patterns to Follow

#### Logging
Always log important steps:
```typescript
CommonHelper.logger('STEP', 'Description of the step');  // Major workflow steps
CommonHelper.logger('INFO', 'Additional information');    // Success/info messages
CommonHelper.logger('WARN', 'Warning message');           // Non-critical issues
CommonHelper.logger('ERROR', 'Error details', error);     // Errors/exceptions
```

#### Resilient Clicking
Use `resilientClick` for better reliability:
```typescript
await CommonHelper.resilientClick(locator, this.page, 'descriptive-name');
```

#### Wait Strategies
Prefer explicit waits over fixed timeouts:
```typescript
// Good ✅
await expect(element).toBeVisible({ timeout: 10000 });
await element.click();

// Avoid ❌
await this.page.waitForTimeout(5000);
await element.click();
```

#### Retry Logic
Implement retry loops for flaky elements:
```typescript
let success = false;
for (let i = 0; i < 5; i++) {
  try {
    await element.click();
    success = true;
    break;
  } catch (err) {
    CommonHelper.logger('WARN', `Attempt ${i + 1} failed, retrying...`);
    await this.page.waitForTimeout(1000);
  }
}

if (!success) {
  throw new Error('Element not clickable after retries');
}
```

#### Error Handling
Always include try-catch with diagnostics:
```typescript
try {
  // Your code
} catch (err) {
  CommonHelper.logger('ERROR', 'Workflow failed:', err);
  if (!this.page.isClosed()) {
    await this.page.screenshot({ path: 'error-screenshot.png', fullPage: true });
  }
  throw err;
}
```

### 3. Integrate with Test File

Add import and usage in `tests/abis.spec.ts`:

```typescript
import { MyWorkflowHelper } from '../utils/myWorkflowHelper';

// In test:
const myWorkflowHelper = new MyWorkflowHelper(page);
await myWorkflowHelper.executeWorkflow('parameter');
```

### 4. Test Your Helper

Run the test multiple times to ensure reliability:
```bash
# Run 3 times to verify stability
npx playwright test tests/abis.spec.ts
npx playwright test tests/abis.spec.ts
npx playwright test tests/abis.spec.ts
```

## 📝 Code Style Guidelines

### TypeScript Best Practices

1. **Use proper types**: Avoid `any`, prefer specific types or interfaces
2. **Document public methods**: Add JSDoc comments with `@param` and `@returns`
3. **Keep methods focused**: Each method should do one thing well
4. **Use descriptive names**: Method names should clearly indicate their purpose

### File Organization

- **Public methods first**: Main workflow methods at the top
- **Private methods below**: Helper methods grouped logically
- **Keep files focused**: One helper = one workflow
- **Maximum ~500 lines**: If larger, consider splitting into sub-helpers

### Naming Conventions

- **Classes**: PascalCase with "Helper" suffix (e.g., `TaskHelper`)
- **Methods**: camelCase, descriptive verbs (e.g., `createPaymentTask()`)
- **Private methods**: camelCase with `private` keyword
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRIES`)

## 🧪 Testing Guidelines

### Test Coverage

- Run tests at least 3 times before submitting
- Test with both success and failure scenarios
- Verify error handling and retry logic
- Check that logs are clear and helpful

### Debugging

1. **Enable headed mode**: See browser actions in real-time
   ```bash
   npx playwright test --headed
   ```

2. **Use debug mode**: Step through test execution
   ```bash
   npx playwright test --debug
   ```

3. **Check logs**: Review `CommonHelper.logger()` output

4. **Review screenshots**: Failed tests save screenshots automatically

## 🔄 Pull Request Process

1. **Create a feature branch**: `git checkout -b feature/my-helper`
2. **Write your code**: Follow the patterns above
3. **Test thoroughly**: Minimum 3 successful runs
4. **Update documentation**: Add to README if needed
5. **Commit with clear messages**: 
   ```
   feat: Add XYZ workflow helper
   
   - Implements XYZ creation workflow
   - Adds retry logic for modal interactions
   - Captures workflow results to JSON
   ```
6. **Submit PR**: Include test results in description

## 📚 Additional Resources

- [Playwright Documentation](https://playwright.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [test_contexts/WORKFLOW_CONTEXT.md](./test_contexts/WORKFLOW_CONTEXT.md) - Complete workflow documentation

## 💡 Tips for Success

1. **Study existing helpers**: See how `ServiceHelper` or `TaskHelper` are structured
2. **Use CommonHelper utilities**: Don't reinvent the wheel
3. **Log everything**: Better too much logging than too little
4. **Think about failures**: What could go wrong? Add fallbacks
5. **Test, test, test**: Flaky tests are worse than no tests

## 🤝 Need Help?

- Review existing helpers in `utils/` directory
- Check test execution logs for examples
- Refer to `test_contexts/WORKFLOW_CONTEXT.md` for business logic

---

**Remember**: The goal is maintainable, reliable, and readable code. When in doubt, favor clarity over cleverness! 🎯
