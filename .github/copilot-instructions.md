# ABIS Playwright Test Suite - AI Coding Agent Instructions

## Project Overview

This is a **modular Playwright E2E test framework** for testing ABIS (Accounting/Business Information System), a complex CRM/ERP application. The project demonstrates **84.7% code reduction** through helper-based architecture, encapsulating business workflows into reusable TypeScript classes.

**Key Achievement:** Main test reduced from 2,274 lines → 349 lines through systematic extraction into 8 specialized helper classes.

## Critical Architecture Principles

### 1. **Helper-Based Modular Design**

Each business workflow is encapsulated in a dedicated helper class located in `utils/sanity/`:

```typescript
// Test file orchestrates workflow steps
const leadHelper = new LeadHelper(page, APP_BASE_URL);
const lead = await leadHelper.createLead();

const proposalHelper = new ProposalHelper(page);
const proposal = await proposalHelper.createAndProcessProposal('#lead-modal');
```

**When adding features:** Create new helper classes following the pattern in `utils/sanity/`. Never inline complex workflows in test files.

### 2. **Resilient Operations Pattern** (CRITICAL)

ABIS has dynamic AJAX-driven UI with flaky elements. **Always use CommonHelper methods** for interactions:

```typescript
// ❌ NEVER do this - flaky and fails randomly
await element.click();
await input.fill(value);

// ✅ ALWAYS do this - retry logic + diagnostics
await CommonHelper.resilientClick(element, page, 'element-label', 3);
await CommonHelper.resilientFill(input, value, page, 'input-label', 3);
```

**Why:** Auto-retries up to 3 times, captures screenshots/HTML on failure, provides detailed error context.

### 3. **Structured Logging Pattern**

Every step MUST be logged using `CommonHelper.logger()` with specific types:

```typescript
CommonHelper.logger('STEP', 'Creating new lead');        // Major workflow steps
CommonHelper.logger('INFO', 'Lead created:', leadId);    // Success/info messages  
CommonHelper.logger('WARN', 'Dropdown empty, retrying'); // Non-critical issues
CommonHelper.logger('ERROR', 'Failed to save', error);   // Errors/exceptions
```

**Why:** Logs are the PRIMARY debugging tool. Test failures are diagnosed by reading timestamped step logs.

## Essential Development Workflows

### Running Tests

```bash
# Run all tests (default: chromium)
npx playwright test

# Run ABIS sanity test specifically
npx playwright test tests/sanity/abis.spec.ts

# Debug mode (step-by-step execution)
npx playwright test --debug

# Headed mode (watch browser)
npx playwright test --headed

# Run tagged tests
npx playwright test -g "@sanity"
```

### Environment Setup (REQUIRED)

Tests require `.env` file in project root:

```bash
APP_BASE_URL=http://your-abis-url/admin
E2E_USER=your-email@example.com
E2E_PASS=your-password
```

**Without this file, all tests will fail.** Environment variables are loaded via `dotenv` in test files.

### CI/CD Pipeline (Jenkins)

**Location:** `Jenkinsfile` (470+ lines, comprehensive pipeline definition)

**Multi-environment support:** DEV, FTRACK, LONGHAUL, UAT - selected via Jenkins parameter

#### Pipeline Stages

1. **Cleanup Workspace**
   - Cleans workspace before checkout using `cleanWs()`
   - Ensures fresh environment for each build
   - Prevents stale files from previous runs

2. **Checkout**
   - Pulls code from GitHub repo (`sakthisiga/pw-mcp`)
   - Uses Git SCM with branch parameter from Jenkins
   - SSH key authentication required

3. **Set Environment Variables**
   - Dynamically creates `.env` file based on selected environment
   - Fetches credentials from Jenkins credentials store:
     - `abis-dev-pass` - DEV environment password
     - `abis-ftrack-pass` - FTRACK environment password
     - `abis-longhaul-pass` - LONGHAUL environment password
     - `abis-uat-pass` - UAT environment password
   - Sets environment-specific URLs:
     ```groovy
     DEV: http://dev-abis.roonaa.in:8553/admin
     FTRACK: http://ftrack-abis.roonaa.in:8663/admin
     LONGHAUL: http://longhaul-abis.roonaa.in:8563/admin
     UAT: https://uat-abis.roonaa.in:8773/admin
     ```
   - Updates build display name: `#<BUILD_NUMBER> - <ENVIRONMENT>`

4. **Install Dependencies & Run abis.spec.ts**
   - **Docker container execution** with following specs:
     ```bash
     docker run --rm \
       -v "${WORKSPACE}:/app" \         # Mount workspace
       -w /app \                        # Working directory
       --ipc=host \                     # Share IPC namespace
       --network=host \                 # Use host network
       -e ABIS_USERNAME="..." \         # Inject credentials
       -e ABIS_PASSWORD="..." \
       -e CI=1 \                        # CI mode flag
       -e FORCE_COLOR=1 \               # Colored output
       mcr.microsoft.com/playwright:v1.56.0-jammy \
       /bin/bash -c "..."
     ```
   - **Container commands executed:**
     1. `rm -rf node_modules` - Clean install
     2. `npm install` - Install dependencies
     3. `npx playwright install chrome` - Install Chrome browser
     4. `npx playwright test -g '@sanity' --reporter=html --retries=1` - Run tests
   - **Why `--ipc=host`:** Required for Chrome's shared memory
   - **Why `--network=host`:** Allows access to internal test environments
   - **CI=1 flag:** Enables CI-specific behaviors (retries, workers=1)

5. **Publish HTML Report**
   - Only runs if `playwright-report/index.html` exists
   - Uses `publishHTML` plugin to make report accessible
   - Report persists across builds (`alwaysLinkToLastBuild: true`)
   - Accessible at: `${BUILD_URL}Playwright_20Test_20Report/`

6. **Archive Test Artifacts**
   - Archives `abis_execution_details.json` if present
   - Allows download from Jenkins UI
   - Fingerprinted for tracking across builds

#### Post-Build Actions (Always Run)

**Email Notification Generation:**
- Calculates execution duration (minutes + seconds)
- Parses `abis_execution_details.json` to extract workflow status
- Generates **HTML email** with:
  - ✅/❌ Overall test status with color coding
  - **Workflow status table** showing all 9 phases:
    - Lead Creation
    - Proposal Creation
    - Customer Conversion
    - Service Creation
    - Task Creation
    - PrePayment Creation
    - Proforma Generation
    - Invoice Creation
    - Payment Recording
  - Links to HTML report and console logs
  - Execution timestamp (Asia/Kolkata timezone)
- Sends to `EMAIL_NOTIFICATION` parameter recipients
- Subject format: `[✅/❌] ABIS <ENV> Sanity Test - <STATUS> - <DATE> <TIME>`

**Docker Cleanup:**
```bash
# Stop all running containers
docker ps -q | xargs -r docker stop

# Remove all containers (running + stopped)
docker ps -aq | xargs -r docker rm

# Images are NOT removed (preserved for faster subsequent runs)
docker images  # Show what's still there
docker system df  # Show disk usage
```

**Why containers removed but not images:**
- Images are large (1-2 GB for Playwright)
- Downloading on every run wastes time and bandwidth
- Containers are small (metadata only)
- Prevents "no space left on device" errors

#### Jenkins Parameters Required

```groovy
ENVIRONMENT (choice): DEV, FTRACK, LONGHAUL, UAT
EMAIL_NOTIFICATION (string): Comma-separated email addresses
GIT_BRANCH (string): Branch to checkout (default: main/externalized-helpers)
```

#### Docker Image Details

**Image:** `mcr.microsoft.com/playwright:v1.56.0-jammy`
- **Base:** Ubuntu 22.04 (Jammy Jellyfish)
- **Pre-installed:** Node.js, npm, Playwright browsers
- **Size:** ~2 GB
- **Why pinned to v1.56.0:** Matches local Playwright version for consistency

**Local Testing with Docker:**
```bash
# Simulate Jenkins environment locally
docker run --rm -it \
  -v "$(pwd):/app" \
  -w /app \
  --ipc=host \
  mcr.microsoft.com/playwright:v1.56.0-jammy \
  /bin/bash

# Inside container:
npm install
npx playwright install chrome
CI=1 npx playwright test -g '@sanity' --retries=1
```

#### Troubleshooting CI Failures

**Container exits immediately:**
- Check credentials are set in Jenkins
- Verify `.env` file is created in "Set Environment Variables" stage
- Check workspace mount path is correct

**Tests fail in CI but pass locally:**
- Run with `CI=1` env var locally
- Check `slowMo` is disabled in CI (see `playwright.config.ts`)
- Verify retries=1 behavior (CI uses retries, local doesn't)

**"No space left on device":**
- Cleanup stage should remove containers
- Check if disk is genuinely full: `docker system df`
- Manually prune if needed: `docker system prune -a --volumes`

**Network timeouts:**
- Verify `--network=host` is set
- Check test environment URLs are accessible from Jenkins server
- Test with `curl` from Jenkins shell: `curl -I <ABIS_URL>`

**When modifying tests:** 
- Ensure CI compatibility (retries=1, workers=1, CI=1 env var)
- Test with Docker locally before pushing
- Update email template in `Jenkinsfile` if adding new workflow phases

## Project-Specific Conventions

### Test Data Generation (Faker.js)

**IMPORTANT:** Tests use `faker` (v5.5.3) NOT `@faker-js/faker`:

```typescript
const faker = require('faker'); // ✅ Correct - v5 API
faker.locale = 'en_IND';        // Indian locale for realistic data

const name = faker.name.findName();
const email = faker.internet.email();
const phone = faker.phone.phoneNumber('999#######'); // Indian mobile format
```

**Why v5:** Legacy codebase uses old API. DO NOT upgrade to `@faker-js/faker` without updating all imports.

### Data Persistence Pattern

Test execution data is captured in `abis_execution_details.json` using `jsonWriteHelper`:

```typescript
// Read existing data
const detailsJson = readAbisExecutionDetails();

// Add/update section
detailsJson.proposal = { proposalNumber: 'PRO-001880', services: [...] };

// Write back atomically
writeAbisExecutionDetails(detailsJson);
```

**Structure:** Single JSON file with sections: `lead`, `proposal`, `company`, `service`, `proforma`, `invoice`, `payment`.

**Why:** Enables debugging (inspect what data was captured before failure), Jenkins reporting, and cross-phase data sharing.

### Selector Strategies (CRITICAL for ABIS)

ABIS has **inconsistent selectors and dynamic IDs**. Use multi-strategy fallback pattern:

```typescript
// Try multiple selectors in sequence
let searchInput = page.locator('table thead input[type="search"]').first();
if (await searchInput.count() === 0) {
  searchInput = page.locator('table input[type="search"]').first();
}
if (await searchInput.count() === 0) {
  searchInput = page.locator('input[placeholder*="search" i]').first();
}
```

**Common ABIS quirks:**
- Dropdowns require manual `change` event triggering for AJAX cascades
- Modals often have persistent backdrops requiring forceful removal
- Dynamic content needs explicit waits (5-10 seconds common)
- ZIP code field has 3+ different selector variations

### TypeScript Patterns

```typescript
// Export interfaces for typed data exchange
export interface LeadDetails {
  leadId: string;
  name: string;
  email: string;
  // ... etc
}

// Helper classes use constructor injection
export class LeadHelper {
  constructor(private page: Page, private baseUrl: string) {}
  
  async createLead(): Promise<LeadDetails> {
    // Implementation with detailed logging
  }
}
```

**Conventions:**
- Private methods for internal steps
- Public methods for workflow orchestration
- Always return typed objects (no `any`)
- Use `async/await` consistently (no `.then()`)

## File Organization

```
utils/
├── commonHelper.ts           # Shared: logger, resilientClick, resilientFill, etc.
├── loginHelper.ts            # Exported function (not class) - login(page, url, user, pass)
├── jsonWriteHelper.ts        # read/writeAbisExecutionDetails()
└── sanity/                   # Business workflow helpers
    ├── leadHelper.ts         # Lead creation (187 lines)
    ├── proposalHelper.ts     # Proposal + acceptance (289 lines)
    ├── customerHelper.ts     # Customer conversion + admin (277 lines)
    ├── serviceHelper.ts      # Service creation (266 lines)
    ├── taskHelper.ts         # Task creation with retries (685 lines)
    ├── proformaHelper.ts     # Proforma generation (345 lines)
    └── invoiceHelper.ts      # Invoice + payment workflow (436 lines)
```

**Pattern:** `tests/sanity/abis.spec.ts` orchestrates helpers in `test.step()` blocks. Each step captures data and passes to next phase.

## Common Pitfalls & Solutions

### 1. AJAX Dropdown Population

**Problem:** Service dropdown empty after company selection.

**Solution:** Manual event trigger + wait:

```typescript
await page.evaluate(() => {
  document.querySelector('select#company').dispatchEvent(
    new Event('change', { bubbles: true })
  );
});
await page.waitForTimeout(5000); // Required for AJAX
```

### 2. Modal Persistence Issues

**Problem:** Modal backdrop stays, blocking interactions.

**Solution:** Aggressive cleanup:

```typescript
await page.keyboard.press('Escape');
await page.locator('.modal-backdrop').click({ force: true });
// Nuclear option:
await page.evaluate(() => {
  document.querySelectorAll('.modal, .modal-backdrop').forEach(el => el.remove());
});
```

### 3. Element Not Clickable (Strict Mode)

**Problem:** "Multiple elements match selector" error.

**Solution:** Use `.first()`, `.nth()`, or filter:

```typescript
await page.locator('button:has-text("Save")').first().click();
// or
await page.locator('button').filter({ hasText: 'Save' }).click();
```

### 4. Test Timeouts

**Current limit:** 300 seconds (5 minutes) per test in `playwright.config.ts`.

**If timing out:**
- Check for infinite retry loops in helpers
- Reduce `slowMo` (currently 100ms, only for local debug)
- Remove unnecessary `waitForTimeout()` calls
- Verify selectors aren't causing long waits

## Integration Points & Dependencies

### External Dependencies

- **Playwright:** v1.56.0 (pinned for CI Docker image compatibility)
- **faker:** v5.5.3 (legacy API, DO NOT upgrade)
- **node-html-parser:** v7.0.1 (used in `invoiceHelper` for robust HTML parsing)
- **dotenv:** v17.2.3 (environment variable management)

### CI/CD Integration

**Jenkins pipeline expectations:**
- Tests run in `mcr.microsoft.com/playwright:v1.56.0-jammy` Docker image
- Environment variables injected from Jenkins credentials store
- HTML report published to Jenkins (`playwright-report/index.html`)
- Execution details archived as build artifact
- Email notifications sent with workflow status table

**When adding tests:** Update Jenkins email template in `Jenkinsfile` if new workflow phases added.

## Documentation Structure

- **`test_contexts/WORKFLOW_CONTEXT.md`** (1000+ lines) - Complete business workflow documentation, 13-phase breakdown, debugging guide
- **`test_contexts/setup.md`** - MCP tools integration for AI-assisted test generation
- **`CONTRIBUTING.md`** - Helper class creation guide with code templates
- **`README.md`** - Project overview with helper class table + metrics

**When to update:**
- **WORKFLOW_CONTEXT.md:** When selectors change, new phases added, or workflow logic modified
- **CONTRIBUTING.md:** When helper patterns change or new conventions adopted
- **README.md:** When adding new helpers or updating architecture

## Key Performance Considerations

**Current optimizations:**
- Screenshots only on failure (`playwright.config.ts`)
- Strategic waits (explicit over fixed timeouts)
- Reuse page instance (no unnecessary navigations)
- Parallel selector strategies (try multiple at once)

**DO NOT:**
- Take screenshots at every step (increases runtime by 30%+)
- Use fixed `waitForTimeout()` without reason (prefer `expect().toBeVisible()`)
- Create multiple browser contexts (single context sufficient)

## Testing Best Practices for This Project

1. **Always start from working examples:** Study `leadHelper.ts` or `proposalHelper.ts` before creating new helpers
2. **Run tests 3+ times before committing:** ABIS UI is flaky, ensure consistency
3. **Use headed mode for development:** See what's actually happening (`--headed`)
4. **Check logs first when debugging:** Timestamps show exactly where failure occurred
5. **Verify JSON output:** Ensure `abis_execution_details.json` has expected data
6. **Test in CI-like environment:** Run with `CI=1` env var to simulate Jenkins: `CI=1 npx playwright test`
7. **Test with Docker locally before pushing:** Use same image as Jenkins to catch environment-specific issues

## Docker Development Workflow

### Running Tests in Docker Locally

**Quick test (same as Jenkins):**
```bash
docker run --rm \
  -v "$(pwd):/app" \
  -w /app \
  --ipc=host \
  --network=host \
  mcr.microsoft.com/playwright:v1.56.0-jammy \
  /bin/bash -c "npm install && npx playwright install chrome && CI=1 npx playwright test -g '@sanity' --retries=1"
```

**Interactive development (explore in container):**
```bash
# Start interactive shell
docker run --rm -it \
  -v "$(pwd):/app" \
  -w /app \
  --ipc=host \
  --network=host \
  mcr.microsoft.com/playwright:v1.56.0-jammy \
  /bin/bash

# Inside container, run commands manually:
npm install
npx playwright install chrome
npx playwright test --headed  # Won't work in container without X11
npx playwright test --debug   # Won't work without display
CI=1 npx playwright test      # Best for container testing
```

**With X11 forwarding (macOS - requires XQuartz):**
```bash
# Install XQuartz first: brew install --cask xquartz
# Start XQuartz and enable "Allow connections from network clients"
xhost + localhost

docker run --rm -it \
  -v "$(pwd):/app" \
  -w /app \
  -e DISPLAY=host.docker.internal:0 \
  --ipc=host \
  mcr.microsoft.com/playwright:v1.56.0-jammy \
  /bin/bash

# Now you can use --headed mode inside container
npx playwright test --headed
```

### Docker Best Practices

**Volume Mounting:**
- Always mount workspace as `/app` for consistency with Jenkins
- Use `$(pwd)` for current directory on macOS/Linux
- Use `%cd%` on Windows CMD or `${PWD}` on PowerShell

**Network Access:**
- Use `--network=host` for accessing local dev environments
- For production URLs, default bridge network is fine
- Test internal URLs accessibility: `docker run --rm --network=host curlimages/curl <URL>`

**IPC Configuration:**
- `--ipc=host` required for Chrome's shared memory
- Without it, Chrome may crash with "Failed to create shared memory"
- More info: https://github.com/microsoft/playwright/issues/5721

**Container Cleanup:**
- `--rm` flag auto-removes container after exit
- Without it, stopped containers accumulate (use `docker ps -a` to see)
- Manual cleanup: `docker container prune`

**Image Management:**
```bash
# Pull latest Playwright image
docker pull mcr.microsoft.com/playwright:v1.56.0-jammy

# Check local images
docker images | grep playwright

# Remove old versions if needed
docker rmi mcr.microsoft.com/playwright:v1.55.0-jammy

# Check disk usage
docker system df
```

### Comparing Local vs Docker vs CI Behavior

| Aspect | Local (macOS) | Docker Local | Jenkins CI |
|--------|---------------|--------------|------------|
| Node modules | Local npm | Fresh install | Fresh install |
| Browser | System or npx install | npx install chrome | npx install chrome |
| slowMo | 100ms | 100ms | 0ms (CI=1) |
| Retries | 0 | 0 (unless CI=1) | 1 |
| Workers | Parallel | Parallel | 1 (CI=1) |
| Screenshots | only-on-failure | only-on-failure | only-on-failure |
| Network | Host machine | Host network | Host network |
| Display | Available | None (headless) | None (headless) |

**Key difference:** Set `CI=1` env var to match Jenkins behavior locally.

### Debugging Docker Issues

**Container exits immediately:**
```bash
# Check what's failing
docker run --rm -it \
  -v "$(pwd):/app" \
  -w /app \
  mcr.microsoft.com/playwright:v1.56.0-jammy \
  /bin/bash -c "ls -la && cat package.json && npm install"
```

**Permission issues:**
```bash
# Files created in container may have wrong ownership
ls -la  # Check ownership
sudo chown -R $(whoami):$(whoami) .  # Fix if needed
```

**Volume mount not working:**
```bash
# Verify mount
docker run --rm \
  -v "$(pwd):/app" \
  alpine:latest \
  ls -la /app  # Should show your files
```

**Network connectivity:**
```bash
# Test from inside container
docker run --rm -it --network=host \
  mcr.microsoft.com/playwright:v1.56.0-jammy \
  /bin/bash -c "apt-get update && apt-get install -y curl && curl -I http://dev-abis.roonaa.in:8553"
```

## Quick Reference - Most Used Patterns

```typescript
// 1. Resilient click with label for diagnostics
await CommonHelper.resilientClick(page.locator('button#save'), page, 'save-button');

// 2. Resilient fill with validation
await CommonHelper.resilientFill(page.locator('input#name'), value, page, 'name-field');

// 3. Multi-strategy selector fallback
let element = page.locator('#ideal');
if (await element.count() === 0) element = page.locator('[name="ideal"]');
if (await element.count() === 0) element = page.locator('[name*="part"]');

// 4. AJAX dropdown handling
await dropdown.selectOption({ label: 'Option' });
await page.evaluate(() => document.querySelector('select').dispatchEvent(new Event('change')));
await page.waitForTimeout(5000);

// 5. Retry loop pattern
for (let i = 0; i < 5; i++) {
  try {
    await action();
    break;
  } catch (err) {
    if (i === 4) throw err;
    await page.waitForTimeout(1000);
  }
}

// 6. Data capture pattern
const detailsJson = readAbisExecutionDetails();
detailsJson.newSection = { id: extractedId, status: 'success' };
writeAbisExecutionDetails(detailsJson);

// 7. Structured logging
CommonHelper.logger('STEP', 'Starting phase X');
CommonHelper.logger('INFO', 'Phase completed', { data });
```

---

**Last Updated:** October 30, 2025  
**Codebase Version:** Compatible with test refactoring on `externalized-helpers` branch
