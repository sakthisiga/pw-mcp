# ABIS Sanity Test - Complete Workflow Context

## 📋 Overview

This document provides comprehensive context for the ABIS (Accounting/Business Information System) end-to-end test workflow. This is a complex CRM/ERP system test that simulates a complete business lifecycle from lead generation to payment collection.

**Test File:** `tests/abis.spec.ts`  
**Test Duration:** ~5 minutes (300 second timeout)  
**Browser:** Chromium (Desktop Chrome)  
**Purpose:** Validate complete business workflow in ABIS system

---

## 🏗️ Architecture

### Project Structure
```
pw-mcp/
├── tests/
│   └── abis.spec.ts              # Main E2E test (~2000+ lines)
├── utils/
│   ├── commonHelper.ts           # Logging & resilient operations
│   ├── LoginHelper.ts            # Authentication helper
│   ├── leadHelper.ts             # Lead creation helper
│   └── jsonWriteHelper.ts        # JSON I/O utilities
├── playwright.config.ts          # Playwright configuration
├── abis_execution_details.json   # Runtime data capture
└── .env                          # Environment variables (not in repo)
```

### Environment Variables
Required in `.env` file:
- `APP_BASE_URL` - Base URL of ABIS application
- `E2E_USER` - Test user email
- `E2E_PASS` - Test user password

### Dependencies
- **@playwright/test** - Testing framework
- **faker** - Generates realistic fake data
- **dotenv** - Environment variable management
- **node-html-parser** - HTML parsing for data extraction

---

## 🎯 Complete Workflow (13 Phases)

### Phase 1: Authentication
**Goal:** Log into the ABIS system

**Steps:**
1. Navigate to `APP_BASE_URL`
2. Fill email field with `E2E_USER`
3. Fill password field with `E2E_PASS`
4. Click "Login" button
5. Verify "Invoices Awaiting Payment" text appears

**Helper Used:** `LoginHelper.login()`

**Key Selectors:**
- Email: `input[name="email"]`
- Password: `input[name="password"]`
- Login button: `button:has-text("Login")`

---

### Phase 2: Lead Creation
**Goal:** Create a new business lead with fake but realistic data

**Steps:**
1. Navigate to `/leads` page
2. Click "New Lead" link
3. Wait for "Add new lead" heading
4. Generate fake data using Faker.js:
   - Name (e.g., "Claire Bashirian")
   - Email (e.g., "Albertha.Wehner@gmail.com")
   - Phone (9-digit number starting with 999)
   - Company (e.g., "Gislason Inc")
   - Address (e.g., "55876 Jaleel Parks")
   - City (e.g., "Lake Jordiside")
   - State (hardcoded: "Tamil Nadu")
   - Zip (6-digit number)
5. Fill lead form (`#lead_form`)
6. Click "Save" button
7. Wait for lead modal (`#lead-modal`) to appear

**Helper Used:** `LeadHelper.createLead()`

**Data Captured:**
```json
{
  "lead": {
    "name": "string",
    "email": "string",
    "phone": "string",
    "company": "string",
    "address": "string",
    "city": "string",
    "state": "string",
    "zip": "string"
  }
}
```

**Key Selectors:**
- Form: `#lead_form`
- Name: `input#name`
- Email: `input#email`
- Phone: `input#phonenumber`
- Company: `input#company`
- State: `select#state`
- Zip: `input#zipcode` (with fallbacks)

---

### Phase 3: Proposal Creation
**Goal:** Create a proposal with services for the lead

**Steps:**
1. In lead modal, click "Proposals" tab
2. Click "New Proposal" button
3. Navigate to proposal creation page
4. Wait for "New Proposal" heading
5. **Company Selection:**
   - Select random company from dropdown (excluding index 0)
   - Manually trigger change event for cascading dropdowns
6. Wait 5 seconds for service dropdown to populate
7. **First Service Selection:**
   - Select random service from dropdown
   - Ensure not "Choose Service"
8. Click "Add Item" button (`#btnAdditem`)
9. **Second Service Selection:**
   - Select different random service
   - Ensure distinct from first service
   - Click "Add Item" again
10. Click "Save" button
11. Extract proposal number from page (e.g., `PRO-001880`)

**Data Captured:**
```json
{
  "proposal": {
    "proposalNumber": "PRO-XXXXXX",
    "services": [
      {
        "name": "Service Name 1",
        "company": "Company Name"
      },
      {
        "name": "Service Name 2",
        "company": "Company Name"
      }
    ]
  }
}
```

**Key Selectors:**
- Proposals tab: `button, a:has-text("Proposals")`
- New Proposal: `button, a:has-text("New Proposal")`
- Company dropdown: `select:nth(0)`
- Service dropdown: `select:nth(1)`
- Add item button: `#btnAdditem`
- Save button: `button[name=/Save$/i]`

**Robustness Notes:**
- Manual change event triggering for AJAX cascading
- Multiple retry attempts for service dropdown population
- Filters out placeholder options

---

### Phase 4: Proposal Status Updates
**Goal:** Mark proposal as sent and accept/decline services

**Steps:**
1. Click "More" dropdown button
2. Click "Mark as Sent"
3. Verify status label shows "Sent"
4. Find all service rows with Accept/Decline buttons
5. **Randomly accept one service:**
   - Click "Accept" button in selected row
6. **Randomly decline another service:**
   - Click "Decline" button in other row
7. Wait for page to settle

**Key Selectors:**
- More button: `button:has-text("More")`
- Mark as Sent: `text=Mark as Sent`
- Status label: `span.proposal-status-4,label-info:has-text("Sent")`
- Service rows: `tr` with visible Accept/Decline buttons

---

### Phase 5: Lead Search & Customer Conversion
**Goal:** Convert the lead to a customer with PAN and GST

**Steps:**
1. Navigate to `/leads` page
2. Find datatable search input (multiple strategies)
3. Search for lead by name
4. Click lead name hyperlink
5. Wait for lead modal (`#lead-modal`)
6. Click "Convert to customer" link
7. Wait for conversion modal
8. **Generate PAN Number:**
   - Format: 5 letters + 4 digits + 1 letter
   - Example: `IBMHB4791O`
9. **Generate GST Number:**
   - Format: 2-digit state code + PAN + entity code + Z + checksum
   - Example: `23IBMHB4791O1ZK`
10. Fill PAN and GST fields (with multiple selector strategies)
11. Click "Save" button (`#custformsubmit`)
12. Wait for customer profile to load
13. **Extract Client ID** from page content (format: `#897`)

**Data Captured:**
```json
{
  "company": {
    "clientId": "#XXX",
    "company": "Company Name",
    "pan": "XXXXX9999X",
    "gst": "##XXXXX9999X#XX"
  }
}
```

**Key Selectors:**
- Search input: `table thead input[type="search"]` (with fallbacks)
- Lead link: `a:has-text("Lead Name")`
- Convert link: `a:has-text("Convert to customer")`
- PAN input: `input[name='pan_num']` or `#pan_num`
- GST input: `input[name='vat']` or `input[name='gst']`
- Save button: `#custformsubmit`
- Profile tab: `a[data-group="profile"]`

**Robustness Notes:**
- Multiple selector strategies for PAN/GST fields
- Retry logic for field filling
- Validation of filled values
- Realistic PAN/GST generation algorithms

---

### Phase 6: Customer Admin Assignment
**Goal:** Assign an admin to manage the customer

**Steps:**
1. Click "Profile" tab
2. Click "Customer Admins" tab
3. Click "Assign Admin" button
4. Wait for modal (`#customer_admins_assign`)
5. Select random admin from dropdown
6. Click "Save" in modal
7. Wait for modal to close

**Data Captured:**
```json
{
  "company": {
    "customerAdmin": "Admin Name"
  }
}
```

**Key Selectors:**
- Profile tab: `a[data-group="profile"]`
- Customer Admins tab: `button, a:has-text("Customer Admins")`
- Assign Admin button: `button, a:has-text("Assign Admin")`
- Modal: `#customer_admins_assign`
- Dropdown: `select` inside modal
- Save button: `button, a:has-text("Save")`

---

### Phase 7: Service Creation
**Goal:** Create a service for the customer from accepted proposal

**Steps:**
1. Click "Services" tab (`a[data-group="projects"]`)
2. Click "New service" button
3. Wait for service modal
4. **Proposal Selection:**
   - Select from "Accepted Proposals" dropdown (`select#proposal_id`)
   - Match proposal number from Phase 3
   - Try multiple strategies: by text content, by value, by data attributes
5. Wait for "Proposal Services" dropdown to populate
6. Select random service from available options
7. Set deadline (if empty, defaults to current date + 4 days)
8. Click "Save" button (`button#btnsubmit[type="submit"]`)
9. Extract service number from URL (e.g., `/projects/view/1771`)
10. Extract deadline from `input#deadline`

**Data Captured:**
```json
{
  "service": {
    "serviceNumber": "XXXX",
    "deadline": "DD-MM-YYYY"
  }
}
```

**Key Selectors:**
- Services tab: `a[data-group="projects"]`
- New service button: `button, a:has-text("New service")`
- Proposal dropdown: `select#proposal_id`
- Service dropdown: `select#itemable_id`
- Deadline input: `input#deadline`
- Save button: `button#btnsubmit[type="submit"]`

**Robustness Notes:**
- Complex proposal matching logic (tries text, digits, normalized values)
- Multiple retry attempts for dropdown population
- Automatic deadline setting if empty
- Extraction from both URL and input fields

---

### Phase 8: Task Creation
**Goal:** Create a "Payment Collection" task for the service

**Steps:**
1. Click "New Task" button (with extensive fallback logic)
2. Wait for task modal
3. Fill task details:
   - **Subject:** "Payment Collection"
   - **Due Date:** Tomorrow's date (DD-MM-YYYY format)
   - **Assigned to:** Current user (if dropdown exists)
4. Click "Save" in modal
5. Wait for post-save modal
6. Set task status to "In Progress"
7. Close modal (with multiple fallback strategies)
8. Click "Tasks" tab (`a[role="tab"][data-group="project_tasks"]`)
9. Verify "Payment Collection" task appears in Tasks panel
10. If not found, retry task creation

**Key Selectors:**
- New Task button: `a, button:has-text("New Task")`
- Subject input: `input#subject` (with fallbacks)
- Due date input: `input#duedate` (with fallbacks)
- Assign dropdown: `select[name="assigned"]` (with fallbacks)
- Save button: `button, a:has-text("Save")`
- Status dropdown: `select#status`
- Tasks tab: `a[role="tab"][data-group="project_tasks"]`
- Task row: `tr:has-text("Payment Collection")`

**Robustness Notes:**
- Extreme fallback logic for clicking New Task button (evaluate, JS click, etc.)
- Modal detection with multiple strategies
- Forcible modal/backdrop removal if stuck
- Retry logic for task verification
- Network request/response logging

---

### Phase 9: Pre-Payment Creation
**Goal:** Create and approve a pre-payment for the service

**Steps:**
1. Click "Go to Customer" link
2. Click "Pre Payment" tab
3. Click "New Pre Payment" link
4. Wait for pre-payment form
5. **Service Selection:**
   - Click service dropdown button
   - Type space in search to trigger AJAX
   - Wait for service options to load
6. **Payment Mode Selection:**
   - Select from `select[name="custom_fields[credit_note][1]"]`
   - Choose first valid option
7. **Rate Entry:**
   - Fill `table input[name="rate"]` with "100"
8. Click blue tick mark button (`#btnAdditem`)
9. Click "Save" button
10. **Approve Payment:**
    - Click "More" dropdown
    - Click "Approve Payment"
    - Accept alert popup
11. Extract prepayment number (e.g., `PP-000601`)

**Data Captured:**
```json
{
  "service": {
    "prepaymentNumber": "PP-XXXXXX"
  }
}
```

**Key Selectors:**
- Go to Customer: `a:has-text("Go to Customer")`
- Pre Payment tab: `link[name="Pre Payment"]`
- New Pre Payment: `link[name=/New Pre Payment/i]`
- Service dropdown: `button[data-id="project_id"]`
- Service search: `#project_ajax_search_wrapper .bs-searchbox input`
- Payment mode: `select[name="custom_fields[credit_note][1]"]`
- Rate input: `table input[name="rate"]`
- Tick button: `#btnAdditem`
- More dropdown: `button:has-text("More")`
- Approve Payment: `a, button:has-text("Approve Payment")`

**Robustness Notes:**
- AJAX dropdown handling with space character trigger
- Multiple strategies for finding service in dropdown
- Alert dialog handler setup before clicking
- Extensive logging of dropdown options for debugging

---

### Phase 10: Proforma Invoice Creation
**Goal:** Create a proforma invoice and mark as accepted

**Steps:**
1. Navigate to client page (`/clients/client/{clientId}`)
2. Click "Proforma" tab
3. Click "Create New Proforma" link
4. Wait for proforma creation page
5. Select billing company from dropdown
6. (Optional) Click "View Services" and add services
7. **Make fields editable:**
   - Remove readonly attributes via JavaScript
8. Click blue tick mark button (`.btn-primary:has(i.fa-check)`)
9. Click "Save" button
10. Wait for success indicator
11. **Mark as Accepted:**
    - Click "More" dropdown
    - Click "Mark as Accepted"
12. **Extract proforma details:**
    - Proforma Number (e.g., `EST-000831`)
    - Proforma Date
    - Expiry Date
    - Total Amount

**Data Captured:**
```json
{
  "proforma": {
    "proformaNumber": "EST-XXXXXX",
    "proformaDate": "DD-MM-YYYY",
    "expiryDate": "DD-MM-YYYY",
    "total": "X,XXX.XX"
  }
}
```

**Key Selectors:**
- Proforma tab: `link[name="Proforma"]`
- Create New Proforma: `a.btn.btn-primary.mbot15:has-text("Create New Proforma")`
- Billing dropdown: `select[name="c_id"]` or `#mastercompany`
- View Services: `button[name=/View Services/i]`
- Tick button: `button.btn-primary:has(i.fa-check)`
- Save button: `button[name=/Save/i]`
- More dropdown: `button:has-text("More")`
- Mark as Accepted: `a, button:has-text("Mark as Accepted")`

**Robustness Notes:**
- JavaScript execution to make readonly fields editable
- Multiple navigation strategies (waitForNavigation, toast, selector)
- DOM manipulation for stuck modals
- Regex-based data extraction from page content

---

### Phase 11: Invoice Conversion
**Goal:** Convert proforma to invoice and extract invoice details

**Steps:**
1. Click "Convert to Invoice" dropdown button
2. Click "Convert" option
3. Wait for navigation or success indicator
4. **Extract invoice details using node-html-parser:**
   - Invoice Number (e.g., `EFL-000197`)
   - Invoice Date
   - Due Date
   - Sales Agent
   - Total Amount
5. Parse HTML to find values after `<span class="bold">Label:</span>`

**Data Captured:**
```json
{
  "invoice": {
    "invoiceNumber": "EFL-XXXXXX",
    "invoiceDate": "DD-MM-YYYY",
    "dueDate": "DD-MM-YYYY",
    "salesAgent": "Agent Name",
    "total": "X,XXX.XX"
  }
}
```

**Key Selectors:**
- Convert dropdown: `button:has-text(/Convert to Invoice/i)`
- Convert option: `a, button:has-text(/^Convert$/i)`
- Invoice number: `span#invoice-number`
- Labels: `span.bold` followed by text content

**Robustness Notes:**
- HTML parsing with node-html-parser for robust extraction
- Multiple strategies: selectors + regex fallbacks
- Helper function `extractAfterBold()` for label-value pairs

---

### Phase 12: Credit Application
**Goal:** Apply credits to the invoice

**Steps:**
1. Click "Apply Credits" link (`a[data-toggle="modal"][data-target="#apply_credits"]`)
2. Wait for modal (`#apply_credits`)
3. Wait for inputs to appear (with retry logic)
4. Log all input attributes for diagnostics
5. Fill first visible input with "100"
6. Click "Apply" button in modal

**Key Selectors:**
- Apply Credits link: `a[data-toggle="modal"][data-target="#apply_credits"]`
- Modal: `#apply_credits`
- Amount input: First visible `input` in modal
- Apply button: `button, a:has-text("Apply")`

**Robustness Notes:**
- Wait loop for modal content to render
- Logs all input attributes for debugging
- Falls back to first visible input

---

### Phase 13: Payment Recording
**Goal:** Record payment with transaction details and approve

**Steps:**
1. Click "Payment" button
2. Wait for payment panel (`#record_payment_form`)
3. **Select Payment Mode:**
   - Choose random mode from `select[name="paymentmode"]`
   - Exclude empty and "select" placeholder options
4. **Generate Transaction ID:**
   - Create random 12-character alphanumeric string
   - Example: `A7K9M2X4P1Q8`
5. Fill transaction ID in `input[name="transactionid"]`
6. Click "Save" button
7. **Approve Payment:**
   - Click "More" dropdown
   - Click "Approve Payment"
   - Click "Yes, approve it!" in popup
8. Extract payment ID from URL
9. Click "Payment for Invoice" hyperlink

**Data Captured:**
```json
{
  "payment": {
    "paymentId": "XXX"
  }
}
```

**Key Selectors:**
- Payment button: `a.btn.btn-primary:has-text("Payment")`
- Payment panel: `#record_payment_form`
- Payment mode: `select[name="paymentmode"]`
- Transaction input: `input[name="transactionid"]`
- Save button: `button, a:has-text("Save")`
- More dropdown: `button:has-text("More")`
- Approve Payment: `a, button:has-text("Approve Payment")`
- Confirm button: `button, a:has-text("Yes, approve it!")`
- Invoice link: Parent of `text=Payment for Invoice` → `a`

**Robustness Notes:**
- Multiple strategies to find payment panel
- Random alphanumeric generation for realistic transaction IDs
- Extensive logging of available options
- URL parsing for payment ID extraction

---

## 🛠️ Helper Classes Reference

### CommonHelper (`utils/commonHelper.ts`)

#### `logger(type, ...args)`
**Purpose:** Structured logging with timestamps

**Parameters:**
- `type`: 'INFO' | 'STEP' | 'WARN' | 'ERROR'
- `args`: Variable arguments to log

**Output Format:**
```
[STEP] [2025-10-24T01:13:46.523Z] --- Message ---
[INFO] [2025-10-24T01:13:46.523Z] Message details
[WARN] [2025-10-24T01:13:46.523Z] Warning message
[ERROR] [2025-10-24T01:13:46.523Z] Error message
```

#### `resilientFill(locator, value, page, label, retries=3)`
**Purpose:** Fill input with retry logic and error diagnostics

**Flow:**
1. Attempt to fill input
2. Validate value is set correctly
3. If failed, wait 1 second and retry
4. On final failure, capture screenshot and HTML
5. Throw descriptive error

**Files Created on Failure:**
- `fill-fail-{label}-{attempt}.png`
- `fill-fail-{label}-{attempt}.html`

#### `resilientClick(locator, page, label, retries=3)`
**Purpose:** Click element with retry logic

**Flow:**
1. Wait for element to be visible
2. Attempt click
3. If failed, wait 1 second and retry
4. On final failure, capture diagnostics

**Files Created on Failure:**
- `click-fail-{label}-{attempt}.png`
- `click-fail-{label}-{attempt}.html`

#### `resilientExpectVisible(locator, page, label, retries=3)`
**Purpose:** Assert visibility with retry logic

**Flow:**
1. Check if element is visible
2. If not, wait 1 second and retry
3. On final failure, capture diagnostics

---

### LoginHelper (`utils/LoginHelper.ts`)

#### `login(page, APP_BASE_URL, E2E_USER, E2E_PASS)`
**Purpose:** Authenticate user into ABIS system

**Steps:**
1. Navigate to base URL
2. Fill email with resilient fill
3. Fill password with resilient fill
4. Click login button with resilient click
5. Verify "Invoices Awaiting Payment" appears

**Returns:** void (throws on failure)

---

### LeadHelper (`utils/leadHelper.ts`)

#### Constructor: `new LeadHelper(page, baseUrl)`
**Parameters:**
- `page`: Playwright Page object
- `baseUrl`: Base URL of application

#### `createLead()`
**Purpose:** Create a new lead with generated data

**Returns:** `Promise<LeadDetails>`
```typescript
interface LeadDetails {
  name: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  city: string;
  state: string | null;
  zip: string;
}
```

**Data Generation:**
- Name: `faker.name.findName()`
- Email: `faker.internet.email()`
- Phone: `faker.phone.phoneNumber('999#######')`
- Company: `faker.company.companyName()`
- Address: `faker.address.streetAddress()`
- City: `faker.address.city()`
- State: "Tamil Nadu" (hardcoded)
- Zip: Random 6-digit number

**Robustness:**
- Multiple selector strategies for zip field
- Waits for lead modal confirmation

---

### jsonWriteHelper (`utils/jsonWriteHelper.ts`)

#### `writeAbisExecutionDetails(detailsJson, filePath='abis_execution_details.json')`
**Purpose:** Write test execution data to JSON file

**Parameters:**
- `detailsJson`: Object to serialize
- `filePath`: Optional custom path

**Output:** Pretty-printed JSON with 2-space indentation

#### `readAbisExecutionDetails(filePath='abis_execution_details.json')`
**Purpose:** Read and parse execution details

**Returns:** Parsed object or null on error

**Error Handling:** Logs errors to console, returns null

---

## 📊 Data Flow & State Management

### Complete Data Structure
```json
{
  "lead": {
    "name": "Claire Bashirian",
    "email": "Albertha.Wehner@gmail.com",
    "phone": "9992300741",
    "address": "55876 Jaleel Parks",
    "city": "Lake Jordiside",
    "state": "Tamil Nadu",
    "zip": "400845"
  },
  "proposal": {
    "proposalNumber": "PRO-001880",
    "services": [
      {
        "name": "DSC-service",
        "company": "Aanoor Efilings Private Limited and Company"
      },
      {
        "name": "testone",
        "company": "Aanoor Efilings Private Limited and Company"
      }
    ]
  },
  "company": {
    "clientId": "#897",
    "company": "Franecki, Brown and Lesch",
    "pan": "IBMHB4791O",
    "gst": "23IBMHB4791O1ZK",
    "customerAdmin": "Balakrishnan ABISAdmin"
  },
  "service": {
    "serviceNumber": "1771",
    "deadline": "27-10-2025",
    "prepaymentNumber": "PP-000601"
  },
  "proforma": {
    "proformaNumber": "EST-000831",
    "proformaDate": "24-10-2025",
    "expiryDate": "03-11-2025",
    "total": "1,380.00"
  },
  "invoice": {
    "invoiceNumber": "EFL-000197",
    "invoiceDate": "24-10-2025",
    "dueDate": "23-11-2025",
    "salesAgent": "Sakthivel Deivasigamani",
    "total": "1,380.00"
  },
  "payment": {
    "paymentId": "341"
  }
}
```

### Data Flow Diagram
```
Lead Data (faker)
    ↓
Lead Creation → lead object
    ↓
Proposal Creation → proposal object
    ↓
Customer Conversion → company object (PAN/GST)
    ↓
Admin Assignment → company.customerAdmin
    ↓
Service Creation → service object
    ↓
Task Creation → (not captured in JSON)
    ↓
Pre-Payment → service.prepaymentNumber
    ↓
Proforma → proforma object
    ↓
Invoice Conversion → invoice object
    ↓
Payment → payment object
```

---

## 🎨 Design Patterns

### 1. **Resilient Operations Pattern**
**Problem:** Flaky elements due to timing, AJAX, animations  
**Solution:** Automatic retry with diagnostics

```typescript
// Instead of:
await element.click();

// Use:
await CommonHelper.resilientClick(element, page, 'element-label', 3);
```

### 2. **Multiple Selector Strategies**
**Problem:** Dynamic or inconsistent selectors  
**Solution:** Try multiple selector fallbacks

```typescript
let element = page.locator('select#ideal');
if (!(await element.count())) element = page.locator('select[name="ideal"]');
if (!(await element.count())) element = page.locator('select[name*="part"]');
```

### 3. **Page Object Model (Partial)**
**Problem:** Test code mixed with implementation  
**Solution:** Encapsulate pages/features in helper classes

- `LoginHelper` - Authentication
- `LeadHelper` - Lead management

### 4. **Data Builder Pattern**
**Problem:** Complex test data setup  
**Solution:** Use Faker.js + structured generation

```typescript
const lead = {
  name: faker.name.findName(),
  email: faker.internet.email(),
  // ... more fields
};
```

### 5. **State Tracking Pattern**
**Problem:** Need data across workflow phases  
**Solution:** Persist to JSON file

```typescript
writeAbisExecutionDetails({
  lead: { ... },
  proposal: { ... },
  // ... etc
});
```

### 6. **Diagnostic Pattern**
**Problem:** Hard to debug test failures  
**Solution:** Capture screenshots, HTML, logs on failure

```typescript
await page.screenshot({ path: 'debug.png', fullPage: true });
fs.writeFileSync('debug.html', await page.content());
CommonHelper.logger('ERROR', 'Failed at step X', error);
```

---

## 🚨 Robustness Strategies

### Modal Handling
**Challenges:** Modals stuck, backdrops persist, animations delay content

**Solutions:**
1. Wait for modal visibility with retries
2. Wait for modal content to render (not just container)
3. Escape key + click outside on close failure
4. Forcibly remove modal/backdrop via DOM manipulation:
   ```javascript
   document.querySelectorAll('.modal, .modal-backdrop').forEach(el => el.remove());
   ```

### AJAX Handling
**Challenges:** Cascading dropdowns, dynamic content loading

**Solutions:**
1. Manual change event triggering:
   ```javascript
   page.evaluate(() => {
     const el = document.querySelector('select');
     el.dispatchEvent(new Event('change', { bubbles: true }));
   });
   ```
2. Wait for `networkidle` state
3. Manual timeouts after AJAX actions (e.g., 5 seconds)
4. Retry loops checking for content population

### Dropdown Selection
**Challenges:** Dynamic options, AJAX search, placeholders

**Solutions:**
1. Type space character to trigger AJAX search
2. Filter out placeholder options:
   ```typescript
   const valid = options.filter(opt => 
     opt && opt !== 'Choose Service' && opt !== 'Please Select'
   );
   ```
3. Multiple selection strategies:
   - By label: `selectOption({ label: 'Option' })`
   - By value: `selectOption({ value: '123' })`
   - By index: `selectOption({ index: 2 })`
4. Validate selection after choosing

### Element Interaction
**Challenges:** Strict mode violations, hidden elements, overlay issues

**Solutions:**
1. Resilient click with fallbacks:
   ```typescript
   // Try standard click
   await element.click();
   
   // Fallback: element handle click
   const handle = await element.elementHandle();
   await handle.click();
   
   // Fallback: evaluate click
   await element.evaluate(el => el.click());
   
   // Fallback: JavaScript document click
   await page.evaluate(() => {
     document.querySelector('selector').click();
   });
   ```
2. Wait for visibility before interaction
3. Scroll element into view
4. Remove overlays/backdrops

### Data Extraction
**Challenges:** Dynamic content, inconsistent structure

**Solutions:**
1. Regex extraction from page content:
   ```typescript
   const match = content.match(/PRO-\d+/);
   ```
2. HTML parsing with node-html-parser:
   ```typescript
   const root = parse(html);
   const value = root.querySelector('span#id')?.text;
   ```
3. Multiple selector strategies
4. Fallback to attribute values
5. Extraction from URLs

---

## 🔧 Configuration

### Playwright Config (`playwright.config.ts`)

**Key Settings:**
```typescript
{
  testDir: './tests',
  timeout: 180000,              // 3 minutes per test
  fullyParallel: true,          // Parallel execution
  retries: process.env.CI ? 2 : 0,  // Retry on CI
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html']],
  use: {
    trace: 'on-first-retry',
    screenshot: 'on',           // Always capture
    video: 'retain-on-failure',
    launchOptions: {
      slowMo: 100               // 100ms delay between actions
    }
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
}
```

### Test Timeout Structure
```
Total Test: 300 seconds (5 minutes)
├── Login: ~5 seconds
├── Lead Creation: ~10 seconds
├── Proposal: ~30 seconds
├── Customer Conversion: ~20 seconds
├── Admin Assignment: ~10 seconds
├── Service Creation: ~20 seconds
├── Task Creation: ~30 seconds
├── Pre-Payment: ~30 seconds
├── Proforma: ~30 seconds
├── Invoice: ~20 seconds
├── Credits: ~10 seconds
└── Payment: ~30 seconds
Total: ~245 seconds (with buffer)
```

---

## 🐛 Common Issues & Solutions

### Issue 1: Dropdown not populating
**Symptoms:** Service dropdown remains empty after company selection

**Solutions:**
- Manual change event triggering
- Increase wait time (5+ seconds)
- Check network tab for AJAX calls
- Verify company selection succeeded

### Issue 2: Modal stuck/backdrop persists
**Symptoms:** Cannot interact with page, modal overlay visible

**Solutions:**
- Press Escape key
- Click outside modal
- Forcibly remove via DOM manipulation
- Check for nested modals

### Issue 3: Element not clickable (strict mode)
**Symptoms:** "Multiple elements match selector"

**Solutions:**
- Add `.first()` or `.nth(index)`
- Use more specific selector
- Filter by visibility: `.filter({ hasText: 'text' })`
- Use role-based selectors

### Issue 4: Data not extracted
**Symptoms:** Empty values in JSON file

**Solutions:**
- Check regex patterns
- Verify element selectors
- Add wait time before extraction
- Use fallback extraction methods

### Issue 5: Test timeout
**Symptoms:** Test exceeds 300 seconds

**Solutions:**
- Reduce wait times
- Remove unnecessary screenshots
- Optimize selector strategies
- Check for infinite retry loops

---

## 📈 Performance Optimization

### Current Optimizations
1. **Removed routine screenshots** - Only capture on failure
2. **Parallel selector strategies** - Try multiple at once
3. **Strategic waits** - Only wait when necessary
4. **Reuse page instance** - No unnecessary navigation

### Potential Optimizations
1. **Split into smaller tests** - Run phases independently
2. **API setup** - Use API for data creation, UI for validation
3. **Parallel test execution** - Run independent flows together
4. **Reduce slowMo** - Decrease from 100ms to 50ms
5. **Cache authentication** - Save storage state, reuse session

---

## 🧪 Test Maintenance

### When to Update

**Selector Changes:**
- Application UI updates
- ID/class name changes
- DOM structure modifications

**Workflow Changes:**
- New required fields
- Removed/added steps
- Changed navigation paths

**Data Changes:**
- New mandatory fields
- Validation rule changes
- Dropdown option updates

### Best Practices

1. **Keep helpers generic** - Don't hard-code values
2. **Use data attributes** - Prefer `data-testid` when possible
3. **Avoid brittle selectors** - Don't rely on DOM structure
4. **Log extensively** - Helps debug failures quickly
5. **Update JSON structure** - Keep data schema documented
6. **Version control screenshots** - Track visual changes
7. **Regular test runs** - Catch regressions early

---

## 🔍 Debugging Guide

### Step 1: Identify Failure Point
Check logs for last successful STEP:
```
[STEP] [timestamp] --- Last successful action ---
[ERROR] [timestamp] Error message
```

### Step 2: Review Screenshots
Files created on failure:
- `{label}-fail-{attempt}.png`
- `{label}-fail-{attempt}.html`

### Step 3: Check JSON State
Review `abis_execution_details.json`:
- Which phase completed?
- What data was captured?
- Any missing fields?

### Step 4: Review Network Activity
If network logging is enabled:
- Check for failed API calls
- Verify AJAX responses
- Look for 4xx/5xx errors

### Step 5: Reproduce Locally
Run in headed mode:
```bash
npx playwright test tests/abis.spec.ts --headed
```

Watch the browser to understand failure context.

### Step 6: Use Playwright Inspector
```bash
npx playwright test tests/abis.spec.ts --debug
```

Step through test line by line.

---

## 📚 Additional Resources

### Playwright Documentation
- [Selectors](https://playwright.dev/docs/selectors)
- [Test Assertions](https://playwright.dev/docs/test-assertions)
- [API Reference](https://playwright.dev/docs/api/class-test)

### Project Files
- Test: `tests/abis.spec.ts`
- Config: `playwright.config.ts`
- Helpers: `utils/` directory

### Commands
```bash
# Run all tests
npx playwright test

# Run specific test
npx playwright test tests/abis.spec.ts

# Run in headed mode
npx playwright test --headed

# Run with debug
npx playwright test --debug

# View HTML report
npx playwright show-report

# Run with specific grep pattern
npx playwright test -g "@sanity"
```

---

## ✅ Success Criteria

A successful test run will:
1. ✅ Complete all 13 phases without errors
2. ✅ Generate complete `abis_execution_details.json`
3. ✅ Exit with code 0
4. ✅ Take ~3-4 minutes to complete
5. ✅ Capture screenshots only on failure

**Example Success Output:**
```
Running 1 test using 1 worker
✓ tests/abis.spec.ts:17:5 › ABIS Sanity @sanity (245s)

1 passed (4m)
```

---

## 🎓 Learning Resources

### For New Developers
1. Read this context file first
2. Review helper classes in `utils/`
3. Watch test run in headed mode
4. Study one phase at a time
5. Experiment with small modifications

### For AI Assistants
This context provides:
- Complete workflow understanding
- Selector strategies and fallbacks
- Data flow and dependencies
- Error handling patterns
- Debugging techniques

Use this context to:
- Debug test failures
- Extend test coverage
- Refactor for maintainability
- Optimize performance
- Add new test scenarios

---

**Document Version:** 1.0  
**Last Updated:** October 23, 2025  
**Test Version:** Compatible with abis.spec.ts as of October 2025  
**Maintained by:** Test Automation Team
