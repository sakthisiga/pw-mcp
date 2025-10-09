# Create lead

Use the playwright MCP tools.

- Navigate to "/leads" page and ensure it has "New Lead" button.
- Click the "New Lead" button.
- Ensure the form is loaded.
- Enter a random name in "Name" input tag
- Verify the name is in the "Name" input tag
- Enter a random email in "Email Address" input tag
- Verify the email is in the "Email Address" input tag
- Enter a random phone number in "Phone Number" input tag
- Verify the phone number is in the "Phone Number" input tag
- Click the "Save" button
- In the lead modal, click "Proposals" tab
- Click "New Proposal" button
- Ensure the proposal form is loaded
 - Select the first valid company (not the placeholder) in the "Company" dropdown
 - Wait for the "Service" dropdown to be populated with options
 - Log the available service options for debugging
 - Select the 3rd option from the "Service" dropdown
 - Click the button with id "btnAdditem"
 - Click the "Save" button
 - Click "More" in the dropdown and select "Mark as Sent"
- Verify the lead status is updated to "Sent"
- Click the "Accept" button in the page.