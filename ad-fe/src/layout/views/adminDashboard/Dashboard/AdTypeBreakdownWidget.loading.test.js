import React from 'react';
import { act, render, screen } from '@testing-library/react';
import AdTypeBreakdownWidget from './AdTypeBreakdownWidget';
import { ApiGetAdTypeBreakdown } from '../../../../api-wrapper/dashboard/ApiDashboard';

jest.mock('react-dom/test-utils', () => ({ ...jest.requireActual('react-dom/test-utils'), act: require('react').act }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: text => text }) }));
jest.mock('../../../../api-wrapper/dashboard/ApiDashboard', () => ({ ApiGetAdTypeBreakdown: jest.fn() }));

let requests;
const dates = ['2026-11-01', '2026-11-07'];
const result = { isSuccess: true, data: { breakdown: {}, totals: {} } };
beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  requests = [];
  ApiGetAdTypeBreakdown.mockImplementation(payload => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    requests.push({ payload, resolve, reject });
    return promise;
  });
});

test('initial fetch replaces table rows with loading until successful completion', async () => {
  render(<AdTypeBreakdownWidget profileId="123" date={dates} />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading data...');
  expect(screen.queryByText('Sponsored Products')).not.toBeInTheDocument();
  await act(async () => { requests[0].resolve(result); });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByText('Sponsored Products')).toBeInTheDocument();
});

test('rejected fetch clears pending feedback and renders the settled table', async () => {
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    render(<AdTypeBreakdownWidget profileId="123" date={dates} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    await act(async () => { requests[0].reject(new Error('network unavailable')); });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Sponsored Products')).toBeInTheDocument();
    expect(errorLog).toHaveBeenCalled();
  } finally { errorLog.mockRestore(); }
});

test('missing profile makes no request and never leaves an infinite loader', () => {
  render(<AdTypeBreakdownWidget date={dates} />);
  expect(ApiGetAdTypeBreakdown).not.toHaveBeenCalled();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('an old date request finishing cannot clear the active date request loader', async () => {
  const { rerender } = render(<AdTypeBreakdownWidget profileId="123" date={dates} />);
  rerender(<AdTypeBreakdownWidget profileId="123" date={['2026-11-08', '2026-11-14']} />);
  expect(requests).toHaveLength(2);
  expect(requests[1].payload.fromDate).toBe('2026-11-08');
  await act(async () => { requests[0].resolve(result); });
  expect(screen.getByRole('status')).toBeInTheDocument();
  await act(async () => { requests[1].resolve(result); });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByText('Sponsored Products')).toBeInTheDocument();
});
