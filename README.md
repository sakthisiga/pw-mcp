## ABIS AI Enabled Playwright Solution for Browser Automation

### 📚 Documentation

For comprehensive test workflow documentation, see [test_contexts/](./test_contexts/):
- **[WORKFLOW_CONTEXT.md](./test_contexts/WORKFLOW_CONTEXT.md)** - Complete end-to-end workflow documentation
- **[setup.md](./test_contexts/setup.md)** - Test generation guidelines

### 🚀 Quick Start

```bash
# Run all tests
npx playwright test

# Run ABIS sanity test
npx playwright test tests/abis.spec.ts

# Run in headed mode (watch the browser)
npx playwright test --headed

# Run with debug mode
npx playwright test --debug
```

### 🏗️ Project Structure

```
pw-mcp/
├── tests/
│   └── abis.spec.ts              # Main E2E test
├── utils/
│   ├── commonHelper.ts           # Resilient operations
│   ├── LoginHelper.ts            # Authentication
│   ├── leadHelper.ts             # Lead creation
│   └── jsonWriteHelper.ts        # JSON I/O
├── test_contexts/                # Documentation
│   ├── README.md                 # Context index
│   ├── WORKFLOW_CONTEXT.md       # Complete workflow docs
│   └── setup.md                  # Test generation
├── playwright.config.ts          # Test configuration
└── abis_execution_details.json   # Test run data
``` 
