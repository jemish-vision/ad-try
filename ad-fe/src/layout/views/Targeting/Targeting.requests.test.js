const fs = require('fs');
const path = require('path');
const vm = require('vm');
const moment = require('moment');
const source = fs.readFileSync(path.join(__dirname, 'Targeting.js'), 'utf8').replace(/\r\n/g, '\n');
const listing = source.slice(source.indexOf('  const ApiListing = async (arg) => {'), source.indexOf('\n  useEffect(() => {\n    lastFetchParamsRef.current', source.indexOf('  const ApiListing = async (arg) => {')));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const table = deferred(), chart = deferred();
  const context = {
    moment, profileId: { value: 123 }, selectedAdType: 'SP', date: ['2026-10-23', '2026-10-29'],
    appliedFilters: [], campaignId: null, debouncedSearchName: '', perPage: 50, status: 'ENABLED', type: '', targetingTabFilter: 'All',
    gridFilter: '', conditionObj: { sortType: 'DESC' }, fieldName: 'sales', isExactSearchMatch: false, selectedTargetingTypes: [],
    TABS: [{ label: 'All', query: {} }], lastFetchParamsRef: { current: '' }, fetchIdRef: { current: 0 },
    localStorage: { getItem: () => null }, addTargetingQuery: () => '{"status":"ENABLED"}', t: value => value,
    Toast: { error: jest.fn() }, ApiTargetingListing: jest.fn(() => table.promise), ApiTargetingChartListing: jest.fn(() => chart.promise),
    setIsTableLoading: jest.fn(), setChartLoading: jest.fn(), setTotalRow: jest.fn(), setTableData: jest.fn(), setTargetingData: jest.fn(), setChartData: jest.fn(),
  };
  vm.runInNewContext(`${listing}; globalThis.run = ApiListing;`, context);
  return { context, table, chart, run: context.run };
}
const tableResponse = { isSuccess: true, getTargeting: [{ targetId: 'T-1' }], totalRow: { sales: 100 } };
const chartResponse = { isSuccess: true, data: [{ reportDate: '2026-10-29', sales: 100 }] };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('table and chart start before either response, using the same filters', async () => {
  const f = fixture();
  const pending = f.run();
  expect(f.context.ApiTargetingListing).toHaveBeenCalledTimes(1);
  expect(f.context.ApiTargetingChartListing).toHaveBeenCalledTimes(1);
  expect(f.context.ApiTargetingListing.mock.calls[0][0]).toBe(f.context.ApiTargetingChartListing.mock.calls[0][0]);
  f.table.resolve(tableResponse); f.chart.resolve(chartResponse);
  await pending;
});
test('chart renders and clears its loader while table remains pending', async () => {
  const f = fixture(); const pending = f.run();
  f.chart.resolve(chartResponse); await flush();
  expect(f.context.setChartData).toHaveBeenCalledWith(chartResponse.data);
  expect(f.context.setChartLoading).toHaveBeenLastCalledWith(false);
  expect(f.context.setIsTableLoading).toHaveBeenLastCalledWith(true);
  f.table.resolve(tableResponse); await pending;
});
test('table renders and clears its loader while chart remains pending', async () => {
  const f = fixture(); const pending = f.run();
  f.table.resolve(tableResponse); await flush();
  expect(f.context.setTargetingData).toHaveBeenCalledWith(tableResponse);
  expect(f.context.setIsTableLoading).toHaveBeenLastCalledWith(false);
  expect(f.context.setChartLoading).toHaveBeenLastCalledWith(true);
  f.chart.resolve(chartResponse); await pending;
});
test('table rejection does not prevent the chart from completing', async () => {
  const f = fixture(); const pending = f.run();
  f.table.reject(new Error('table failed')); f.chart.resolve(chartResponse); await pending;
  expect(f.context.setChartData).toHaveBeenCalledWith(chartResponse.data);
  expect(f.context.Toast.error).toHaveBeenCalledTimes(1);
  expect(f.context.setIsTableLoading).toHaveBeenLastCalledWith(false);
});
test('chart rejection does not prevent the table from completing', async () => {
  const f = fixture(); const pending = f.run();
  f.chart.reject(new Error('chart failed')); f.table.resolve(tableResponse); await pending;
  expect(f.context.setTargetingData).toHaveBeenCalledWith(tableResponse);
  expect(f.context.Toast.error).toHaveBeenCalledTimes(1);
  expect(f.context.setChartLoading).toHaveBeenLastCalledWith(false);
});
test('responses from a superseded filter request cannot change data or loaders', async () => {
  const f = fixture(); const pending = f.run();
  f.context.fetchIdRef.current++;
  f.table.resolve(tableResponse); f.chart.resolve(chartResponse); await pending;
  expect(f.context.setTargetingData).not.toHaveBeenCalled();
  expect(f.context.setChartData).not.toHaveBeenCalled();
  expect(f.context.setIsTableLoading).toHaveBeenLastCalledWith(true);
  expect(f.context.setChartLoading).toHaveBeenLastCalledWith(true);
});
test('table-only reload still skips the chart', async () => {
  const f = fixture(); const pending = f.run({ isReload: true });
  expect(f.context.ApiTargetingChartListing).not.toHaveBeenCalled();
  expect(f.context.setChartLoading).not.toHaveBeenCalled();
  f.table.resolve(tableResponse); await pending;
});
test('identical in-flight fetch signatures do not duplicate either request', async () => {
  const f = fixture(); const pending = f.run(); await f.run();
  expect(f.context.ApiTargetingListing).toHaveBeenCalledTimes(1);
  expect(f.context.ApiTargetingChartListing).toHaveBeenCalledTimes(1);
  f.table.resolve(tableResponse); f.chart.resolve(chartResponse); await pending;
});
