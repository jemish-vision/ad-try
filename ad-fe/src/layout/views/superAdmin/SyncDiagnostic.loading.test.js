import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import SyncDiagnostic from './SyncDiagnostic';
import { ApiGetSystemDiagnostic, ApiGet15DayReconciliation } from '../../../api-wrapper/superAdmin/ApiSystemDiagnostic';
import Toast from '../../../common/helper/toast/Toast';

jest.mock('react-dom/test-utils', () => ({ ...jest.requireActual('react-dom/test-utils'), act: require('react').act }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: text => text }) }));
jest.mock('../../../components/ui/date-picker', () => ({ ShadcnDatePicker: () => null }));
jest.mock('../../../common/helper/toast/Toast', () => ({ error: jest.fn(), success: jest.fn() }));
jest.mock('../../../api-wrapper/superAdmin/ApiSystemDiagnostic', () => ({
  ApiGetSystemDiagnostic: jest.fn(), ApiGet15DayReconciliation: jest.fn(), ApiDrainStagedBatches: jest.fn(),
}));

const profile = {
  profileId: '123', name: 'Loader Test Store', countryCode: 'IN', timezone: 'Asia/Kolkata',
  isAdsSyncEnabled: true, isSpSyncEnabled: false, syncStatus: 'HEALTHY', issues: [],
  schemaRecords: { campaignsYesterday: 1, campaignsToday: 1, totalSpendYesterday: 5 },
};
let diagnosticRequests, reconRequests;
function deferred(payload) {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { payload, promise, resolve, reject };
}
const diagnosticResponse = { isSuccess: true, data: { profiles: [profile] } };
function reconResponse(docs = [{ reportId: 'report-one', reportName: 'Campaign Report', status: 'COMPLETED' }], page = 1) {
  return { isSuccess: true, data: {
    summary: { overallStatus: 'HEALTHY' },
    dayWiseReconciliation: [{ date: '2026-11-18', status: 'MATCH' }],
    reportsHistory: { docs, pagination: { page, limit: 10, totalCount: 20, totalPages: 2 } },
  } };
}
beforeEach(() => {
  jest.clearAllMocks();
  diagnosticRequests = []; reconRequests = [];
  ApiGetSystemDiagnostic.mockImplementation(payload => {
    const request = deferred(payload); diagnosticRequests.push(request); return request.promise;
  });
  ApiGet15DayReconciliation.mockImplementation(payload => {
    const request = deferred(payload); reconRequests.push(request); return request.promise;
  });
});
async function openReports() {
  render(<SyncDiagnostic />);
  await act(async () => { diagnosticRequests[0].resolve(diagnosticResponse); });
  fireEvent.click(screen.getByRole('button', { name: 'Reconcile with Amazon SP-API' }));
  fireEvent.click(screen.getByRole('button', { name: /Amazon SP-API Generated Reports Log/ }));
}

test('full diagnostic request displays pending status and clears after success or failed refresh', async () => {
  render(<SyncDiagnostic />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading data...');
  await act(async () => { diagnosticRequests[0].resolve(diagnosticResponse); });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByText('Loader Test Store')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh Live Audit' }));
  expect(screen.getByRole('status')).toBeInTheDocument();
  await act(async () => { diagnosticRequests[1].reject(new Error('audit offline')); });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(Toast.error).toHaveBeenCalledWith('audit offline');
});

test('reports tab suppresses premature empty rows during initial request and page refetch', async () => {
  await openReports();
  expect(screen.getByRole('status')).toHaveTextContent('Loading data...');
  expect(screen.queryByText('No report documents recorded in reports collection for this profile.')).not.toBeInTheDocument();
  await act(async () => { reconRequests[0].resolve(reconResponse()); });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByText('report-one')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(reconRequests[1].payload).toEqual({ profileId: '123', page: 2, limit: 10 });
  expect(screen.getByRole('status')).toBeInTheDocument();
  expect(screen.queryByText('report-one')).not.toBeInTheDocument();
  await act(async () => { reconRequests[1].resolve(reconResponse([], 2)); });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByText('No report documents recorded in reports collection for this profile.')).toBeInTheDocument();
});

test('limit refetch remains visible on daily tab with retained rows and clears after rejection', async () => {
  await openReports();
  await act(async () => { reconRequests[0].resolve(reconResponse()); });
  const limit = screen.getAllByRole('combobox').find(select => [...select.options].some(option => option.value === '10') && select.value === '10');
  fireEvent.change(limit, { target: { value: '25' } });
  expect(reconRequests[1].payload).toEqual({ profileId: '123', page: 1, limit: 25 });
  expect(screen.getByRole('status')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /15-Day Day-Wise Data Totals/ }));
  expect(screen.getByText('Verifying 15-day records across MongoDB schemas...')).toBeInTheDocument();
  expect(screen.queryByText('2026-11-18')).not.toBeInTheDocument();
  await act(async () => { reconRequests[1].reject(new Error('reconciliation offline')); });
  expect(screen.queryByText('Verifying 15-day records across MongoDB schemas...')).not.toBeInTheDocument();
  expect(Toast.error).toHaveBeenCalledWith('reconciliation offline');
});
