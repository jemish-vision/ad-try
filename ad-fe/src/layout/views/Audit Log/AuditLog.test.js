import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AuditLog from './AuditLog';
import MetadataModal from './MetadataModal';
import { ApiAditLogListing, ApiAuditLogEvents } from '../../../api-wrapper/auditLog/ApiAuditLog';

jest.mock('react-dom/test-utils', () => ({ ...jest.requireActual('react-dom/test-utils'), act: require('react').act }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: text => text }) }));
jest.mock('react-router-dom', () => ({ useParams: () => ({}) }));
jest.mock('react-redux', () => ({ useDispatch: () => jest.fn() }));
jest.mock('../../../helper/filter/Filter', () => () => null);
jest.mock('../../../helper/usecontext/useContext', () => ({ ProfileContext: require('react').createContext({}) }));
jest.mock('../../../helper/permission/PermissionCheck', () => ({ PermissionCheck: () => true }));
jest.mock('../../../helper/links/Link', () => ({ Toast: { error: jest.fn() } }));
jest.mock('../../../components/ui/date-range-picker', () => ({ ShadcnDateRangePicker: () => null }));
jest.mock('../../../components/ui/multi-select', () => ({ MultiSelect: ({ options }) => <div data-testid="event-options">{options.map(option => <span key={option.value}>{option.label}</span>)}</div> }));
jest.mock('../../../components/ui/dialog', () => {
  const React = require('react');
  const Container = ({ children }) => <div>{children}</div>;
  return { Dialog: ({ open, children }) => open ? <div role="dialog">{children}</div> : null, DialogContent: Container, DialogHeader: Container, DialogTitle: Container, DialogFooter: Container };
});
jest.mock('../../../common/grid/AgTable', () => {
  const React = require('react');
  return React.forwardRef(({ rowData, loading, columnDefs }, ref) => <div>{loading && <span role="status">Loading</span>}{rowData.map(row => <div key={row._id}>{row.message}{columnDefs.find(col => col.field === 'metadata').cellRenderer({ data: row })}</div>)}</div>);
});
jest.mock('../../../api-wrapper/auditLog/ApiAuditLog', () => ({ ApiAditLogListing: jest.fn(), ApiAuditLogEvents: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  ApiAuditLogEvents.mockResolvedValue({ isSuccess: false, data: [] });
  ApiAditLogListing.mockResolvedValue({ isSuccess: true, data: [], totalRecords: 0, canViewOrganization: false });
});

test('loads mine without a selected profile, retains fallback events and hides organization scope', async () => {
  render(<AuditLog />);
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  expect(ApiAditLogListing).toHaveBeenCalledWith(expect.objectContaining({ scope: 'mine', profileId: undefined }));
  expect(screen.queryByLabelText('Audit scope')).not.toBeInTheDocument();
  expect(screen.getByTestId('event-options')).toHaveTextContent('User Login');
});

test('uses server catalog and exposes organization filters only after capability response', async () => {
  ApiAuditLogEvents.mockResolvedValue({ isSuccess: true, data: [{ event: 'AUTOMATION_FAILED', label: 'Automation failed', category: 'Automation' }] });
  ApiAditLogListing.mockResolvedValue({ isSuccess: true, data: [], totalRecords: 0, canViewOrganization: true });
  render(<AuditLog />);
  await screen.findByLabelText('Audit scope');
  expect(screen.getByTestId('event-options')).toHaveTextContent('Automation failed');
  fireEvent.change(screen.getByLabelText('Audit scope'), { target: { value: 'organization' } });
  fireEvent.change(screen.getByLabelText('Actor ID'), { target: { value: 'actor-123' } });
  expect(screen.getByRole('option', { name: 'Pending' })).toHaveValue('PENDING');
  fireEvent.change(screen.getByLabelText('Audit outcome'), { target: { value: 'FAILURE' } });
  await waitFor(() => expect(ApiAditLogListing).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'organization', actorId: 'actor-123', outcome: 'FAILURE', pageNo: 1 })));
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
});

test('failed listing offers retry and recovers cleanly', async () => {
  ApiAditLogListing.mockResolvedValueOnce({ isSuccess: false, message: 'Audit unavailable' });
  render(<AuditLog />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Audit unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  expect(ApiAditLogListing).toHaveBeenCalledTimes(2);
});

test('details retain stable nested IDs and show zero, false and null change values', () => {
  const { rerender } = render(<MetadataModal show onHide={() => {}} metadata={{ campaignId: 'campaign-123', nested: { _id: 'nested-id' } }} extraFields={{ auditId: 'audit-1', operationId: 'op-1' }} changes={{ previousValue: 0, newValue: false }} />);
  expect(screen.getByText('campaign-123')).toBeInTheDocument();
  expect(screen.getByText('nested-id')).toBeInTheDocument();
  expect(screen.getByText('op-1')).toBeInTheDocument();
  expect(screen.getByText('0')).toBeInTheDocument();
  expect(screen.getByText('false')).toBeInTheDocument();
  rerender(<MetadataModal show onHide={() => {}} changes={{ previousValue: null, newValue: '' }} />);
  expect(screen.getByText('null')).toBeInTheDocument();
  expect(screen.getByText('""')).toBeInTheDocument();
});
