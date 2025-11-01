import { login } from '../../utils/loginHelper';
import { LeadHelper, LeadDetails } from '../../utils/sanity/leadHelper';
import { ProposalHelper, ProposalDetails } from '../../utils/sanity/proposalHelper';
import { CustomerHelper } from '../../utils/sanity/customerHelper';
import { ServiceHelper } from '../../utils/sanity/serviceHelper';
import { TaskHelper } from '../../utils/sanity/taskHelper';
import { PrePaymentHelper } from '../../utils/sanity/prepaymentHelper';
import { ProformaHelper } from '../../utils/sanity/proformaHelper';
import { InvoiceHelper } from '../../utils/sanity/invoiceHelper';
import { readAbisExecutionDetails, writeAbisExecutionDetails } from '../../utils/jsonWriteHelper';
import { CommonHelper } from '../../utils/commonHelper';
import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';

const faker = require('faker');
// Set faker locale to India for Indian names and addresses
faker.locale = 'en_IND';

dotenv.config();

const APP_BASE_URL = process.env.APP_BASE_URL;
const E2E_USER = process.env.E2E_USER;
const E2E_PASS = process.env.E2E_PASS;

test('ABIS Sanity @sanity', async ({ page }) => {
  test.setTimeout(300000); // 5 minutes
  CommonHelper.logger('INFO', 'Starting ABIS Sanity Test');
  CommonHelper.logger('INFO', `Using APP URL: ${APP_BASE_URL}`);
  CommonHelper.logger('INFO', `Using USERNAME: ${E2E_USER}`);
  
  let leadId: string, name: string, email: string, phone: string, company: string;
  let address: string, city: string, selectedState: string | null, zip: string;
  let proposalNumberHtml: string, selectedServices: any[];
  let clientId: string, customerAdmin: string;
  let serviceNumber: string, serviceName: string, deadline: string;
  let prepaymentNumber = '';

  await test.step('1. Login', async () => {
    await login(page, APP_BASE_URL!, E2E_USER!, E2E_PASS!);
  });

  await test.step('2. Create Lead', async () => {
    const leadHelper = new LeadHelper(page, APP_BASE_URL!);
    const lead: LeadDetails = await leadHelper.createLead();
    ({ leadId, name, email, phone, company, address, city, state: selectedState, zip } = lead);

    try {
      writeAbisExecutionDetails({
        lead: { leadId, name, email, phone, address, city, state: selectedState, zip }
      });
    } catch (err) {
      CommonHelper.logger('ERROR', 'Error saving lead details to JSON:', err);
    }
  });

  await test.step('3. Create and Accept Proposal', async () => {
    const proposalHelper = new ProposalHelper(page);
    const proposal: ProposalDetails = await proposalHelper.createAndProcessProposal('#lead-modal');
    ({ proposalNumber: proposalNumberHtml, services: selectedServices } = proposal);

    try {
      const detailsJson = readAbisExecutionDetails();
      detailsJson.proposal = { proposalNumber: proposalNumberHtml || '', services: selectedServices };
      writeAbisExecutionDetails(detailsJson);
    } catch (err) {
      CommonHelper.logger('ERROR', 'Error saving proposal details to JSON:', err);
    }
  });

  await test.step('4. Convert Lead to Customer', async () => {
    const customerHelper = new CustomerHelper(page, APP_BASE_URL!);
    ({ clientId, customerAdmin } = await customerHelper.convertToCustomerAndAssignAdmin(name));

    try {
      const detailsJson = readAbisExecutionDetails();
      detailsJson.company = { clientId, company, customerAdmin: customerAdmin?.trim() || '' };
      writeAbisExecutionDetails(detailsJson);
    } catch (err) {
      CommonHelper.logger('ERROR', 'Error saving customer details to JSON:', err);
    }
  });

  await test.step('5. Create Service', async () => {
    const serviceHelper = new ServiceHelper(page);
    ({ serviceNumber, serviceName, deadline } = await serviceHelper.createService(proposalNumberHtml || ''));

    try {
      const detailsJson = readAbisExecutionDetails();
      detailsJson.service = { serviceNumber, serviceName, deadline };
      writeAbisExecutionDetails(detailsJson);
    } catch (err) {
      CommonHelper.logger('ERROR', 'Error saving service details to JSON:', err);
    }
  });

  await test.step('6. Create Task', async () => {
    const taskHelper = new TaskHelper(page);
    await taskHelper.createPaymentCollectionTask();
  });

  await test.step('7. Create and Approve PrePayment', async () => {
    const prePaymentHelper = new PrePaymentHelper(page, APP_BASE_URL!);
    prepaymentNumber = await prePaymentHelper.createAndApprovePrePayment();

    try {
      const detailsJson = readAbisExecutionDetails();
      if (!detailsJson.service) detailsJson.service = {};
      detailsJson.service.prepaymentNumber = prepaymentNumber;
      writeAbisExecutionDetails(detailsJson);
    } catch (err) {
      CommonHelper.logger('ERROR', 'Error saving prepayment to JSON:', err);
    }
  });

  await test.step('8. Create and Accept Proforma', async () => {
    const proformaDetailsJson = readAbisExecutionDetails();
    const clientIdRaw = proformaDetailsJson.company?.clientId || '';
    const proformaClientId = clientIdRaw.replace(/^#/, '');
    if (!proformaClientId) throw new Error('clientId not found in abis_execution_details.json');

    const proformaHelper = new ProformaHelper(page);
    await proformaHelper.createAndAcceptProforma(proformaClientId, APP_BASE_URL!);
  });

  await test.step('9. Convert to Invoice and Record Payment', async () => {
    const invoiceHelper = new InvoiceHelper(page);
    await invoiceHelper.processInvoiceWorkflow();
  });
});

