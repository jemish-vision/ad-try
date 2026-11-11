const fs = require('fs');
const path = require('path');
const vm = require('vm');
const moment = require('moment');

const source = fs.readFileSync(path.join(__dirname, 'KeywordAnalysis.js'), 'utf8').replace(/\r\n/g, '\n');
const start = source.indexOf('  const fetchGrid = async (');
const end = source.indexOf('\n  useEffect(() => {\n    lastFetchParamsRef.current', start);
if (start < 0 || end < start) throw new Error('Keyword Analysis request handler not found');
const handler = source.slice(start, end);

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture() {
  const pending = [];
  const context = {
    moment, profileId: { value: 123 }, selectedAdType: 'SP',
    dateRange: ['2026-10-01', '2026-10-30'], gridPage: 1, gridPerPage: 50,
    sortCol: null, sortOrder: null, debouncedSearch: '', campaignStatus: [],
    lastFetchParamsRef: { current: '' }, fetchIdRef: { current: 0 },
    setLoading: jest.fn(), setGridData: jest.fn(), setGridDateRange: jest.fn(), setTotalRecords: jest.fn(), setGridPage: jest.fn(),
    console: { error: jest.fn() },
    ApiKeywordAnalysis: jest.fn(() => {
      const request = deferred();
      pending.push(request);
      return request.promise;
    }),
  };
  vm.runInNewContext(`${handler}; globalThis.run = fetchGrid;`, context);
  return { context, pending, run: context.run };
}

const response = id => ({ isSuccess: true, getKeywordAnalysisData: [{ id }], totalKeywordAnalysisData: 1 });

test('an older response cannot replace the latest page', async () => {
  const f = fixture();
  const oldRequest = f.run(1);
  f.context.dateRange = ['2026-11-01', '2026-11-02'];
  const newRequest = f.run(2);
  f.pending[1].resolve(response('new'));
  await newRequest;
  f.pending[0].resolve(response('old'));
  await oldRequest;
  expect(f.context.setGridData.mock.calls).toEqual([[[{ id: 'new' }]]]);
  expect(f.context.setGridDateRange.mock.calls).toEqual([
    [{ fromDate: '2026-11-01', toDate: '2026-11-02' }],
  ]);
  expect(f.context.setGridPage).toHaveBeenCalledTimes(1);
  expect(f.context.setGridPage).toHaveBeenCalledWith(2);
});

test('a superseded failure cannot clear the current request loader', async () => {
  const f = fixture();
  const oldRequest = f.run(1);
  const newRequest = f.run(2);
  f.pending[0].reject(new Error('old request failed'));
  await oldRequest;
  expect(f.context.setLoading).toHaveBeenLastCalledWith(true);
  f.pending[1].resolve(response('new'));
  await newRequest;
  expect(f.context.setLoading).toHaveBeenLastCalledWith(false);
});

test('duplicate requests are skipped while an ad type change starts a fresh request', async () => {
  const f = fixture();
  const oldRequest = f.run();
  await f.run();
  expect(f.context.ApiKeywordAnalysis).toHaveBeenCalledTimes(1);
  f.context.selectedAdType = 'SB';
  const newRequest = f.run();
  expect(f.context.ApiKeywordAnalysis).toHaveBeenCalledTimes(2);
  f.pending[0].resolve(response('old'));
  f.pending[1].resolve(response('new'));
  await Promise.all([oldRequest, newRequest]);
  expect(f.context.setGridData).toHaveBeenCalledTimes(1);
  expect(f.context.setGridData).toHaveBeenCalledWith([{ id: 'new' }]);
});
