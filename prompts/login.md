# Login to Abis

Environment variables are externalized to the project root `.env` file. Please set the following keys there before running the Playwright MCP steps:

- APP_BASE_URL
- E2E_USER
- E2E_PASS

Use the playwright MCP tools and generate a playwright test for the following scenario:

1. Navigate to ${APP_BASE_URL}.
2. Fill the Email Address from ${E2E_USER}.
3. Fill the Password from ${E2E_PASS}.
4. Click the "Submit" button.
5. Wait until the "Invoices Awaiting Payment" page appears.
6. Verify that the text "Invoices Awaiting Payment" is visible.