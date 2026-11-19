import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import AsanaUsers from './AsanaUsers';
import { ApiAsanaUserList } from '../../../api-wrapper/ApiAsanaUsers';
import Toast from '../../../common/helper/toast/Toast';

jest.mock('react-dom/test-utils', () => ({ ...jest.requireActual('react-dom/test-utils'), act: require('react').act }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: text => text }) }));
jest.mock('i18next', () => ({ t: text => text }));
jest.mock('../../../helper/filter/Filter', () => () => null);
jest.mock('../../../helper/modal/CustomModal', () => ({ CustomModal: () => null }));
jest.mock('../../../common/helper/toast/Toast', () => ({ error: jest.fn(), success: jest.fn() }));
jest.mock('../../../api-wrapper/ApiAsanaUsers', () => ({
  ApiAsanaUserList: jest.fn(),
  ApiAsanaFetchUsers: jest.fn(),
  ApiAssignSupportUser: jest.fn(),
}));
jest.mock('../../../common/grid/AgTable', () => {
  const React = require('react');
  return React.forwardRef(({ loading, rowData, onPageChange, onRefresh }, ref) => (
    <section aria-busy={loading} aria-label="Asana data table">
      {loading ? <div role="status">Loading data...</div> : rowData.length === 0 ? <p>No records found</p> : rowData.map(row => <p key={row.gid}>{row.name}</p>)}
      <button onClick={() => onPageChange(2)}>Next page</button>
      <button onClick={() => onRefresh()}>Refresh table</button>
    </section>
  ));
});

let requests;
beforeEach(() => {
  jest.clearAllMocks();
  requests = [];
  ApiAsanaUserList.mockImplementation(payload => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    requests.push({ payload, resolve, reject });
    return promise;
  });
});

const response = (rows = []) => ({ isSuccess: true, getUsers: rows, totalRecords: rows.length });
const alice = { gid: 'alice', name: 'Alice', email: 'alice@example.invalid' };
async function settle(request, result) {
  await act(async () => { request.resolve(result); });
}
async function finishInitial(rows = [alice]) {
  for (const request of [...requests]) await settle(request, response(rows));
}

test('overlapping initial requests keep the loader until both settle, then show populated rows', async () => {
  render(<AsanaUsers />);
  expect(requests).toHaveLength(2);
  expect(screen.getByRole('status')).toHaveTextContent('Loading data...');
  expect(screen.queryByText('No records found')).not.toBeInTheDocument();
  await settle(requests[0], response([alice]));
  expect(screen.getByRole('status')).toBeInTheDocument();
  await settle(requests[1], response([alice]));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByText('Alice')).toBeInTheDocument();
});

test('page refetch shows loading and reveals the empty state only after success', async () => {
  render(<AsanaUsers />);
  await finishInitial();
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  const pageRequest = requests.at(-1);
  expect(pageRequest.payload.pageNo).toBe(2);
  expect(screen.getByRole('status')).toBeInTheDocument();
  expect(screen.queryByText('No records found')).not.toBeInTheDocument();
  await settle(pageRequest, response());
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByText('No records found')).toBeInTheDocument();
});

test('rejected refresh clears loading, reports failure, and preserves existing rows', async () => {
  render(<AsanaUsers />);
  await finishInitial();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh table' }));
  expect(screen.getByRole('status')).toBeInTheDocument();
  await act(async () => { requests.at(-1).reject(new Error('network unavailable')); });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByText('Alice')).toBeInTheDocument();
  expect(Toast.error).toHaveBeenCalledWith('Something went wrong');
});

test('one failed overlapping request cannot hide the remaining request loader', async () => {
  render(<AsanaUsers />);
  await act(async () => { requests[0].reject(new Error('network unavailable')); });
  expect(screen.getByRole('status')).toBeInTheDocument();
  await settle(requests[1], response());
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByText('No records found')).toBeInTheDocument();
});
