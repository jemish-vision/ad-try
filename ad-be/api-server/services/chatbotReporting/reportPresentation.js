'use strict';

const IDENTITY_KEYS = [
  'profileId', 'adType', 'campaignId', 'adGroupId', 'keywordId',
  'targetId', 'searchTerm', 'placement', 'productId', 'ruleId',
];

function addWarning(report, message) {
  if (!report.warnings.includes(message) && report.warnings.length < 50) {
    report.warnings.push(message);
  }
}

function addChart(report, block) {
  if (report.blocks.length < 100) {
    report.blocks.push(block);
  } else {
    addWarning(report, 'Additional charts were omitted at the response limit.');
  }
}

function addDataset(report, dataset) {
  if (report.datasets.length >= 20) {
    addWarning(report, 'Additional chart datasets were omitted at the response limit.');
    return false;
  }

  report.datasets.push(dataset);
  return true;
}

function uniqueId(report, prefix) {
  let index = 0;
  while (report.datasets.some(dataset => dataset.id === `${prefix}_${index}`)) {
    index += 1;
  }
  return `${prefix}_${index}`;
}

function numericMetrics(dataset, request) {
  const selected = request.metrics.filter(metric => dataset.columns.some(column => (
    column.key === metric && column.type === 'number'
  )));
  const first = selected[0];
  const unit = dataset.columns.find(column => column.key === first)?.unit;

  // Counts, percentages and money must never share a numeric axis.
  return selected.filter(metric => dataset.columns.find(column => column.key === metric)?.unit === unit).slice(0, 5);
}

function scopeLabel(dataset) {
  const first = dataset.rows[0] || {};
  return [first.profileId, first.adType, dataset.currencyCode].filter(Boolean).join(' / ');
}

function isPartialPage(dataset) {
  return dataset.page && (dataset.page.offset > 0 || dataset.page.hasMore
    || (dataset.page.total !== null && dataset.page.total > dataset.rows.length));
}

function sourceTables(report) {
  return report.blocks.filter(block => block.type === 'table' && /^report_\d+$/.test(block.datasetId))
    .map(block => ({ block, dataset: report.datasets.find(dataset => dataset.id === block.datasetId) }))
    .filter(item => item.dataset?.rows.length);
}

function requestedPresentation(report, request) {
  if (request.presentation !== 'auto') {
    return request.presentation;
  }
  if (['waste', 'growth', 'rules', 'definition'].includes(request.category)) {
    return 'table';
  }
  if (request.category === 'time') {
    return 'heatmap';
  }
  if (request.category === 'products') {
    return 'bar';
  }
  if (request.groupBy.includes('date')) {
    return 'line';
  }
  const hasPreviousPeriod = sourceTables(report).some(({ block }) => /comparison\s*$/.test(block.title));
  if (request.category === 'comparison'
    || (['summary', 'change'].includes(request.category) && hasPreviousPeriod)) {
    return 'grouped_bar';
  }
  if (request.metrics.length === 1 && report.cards.some(card => card.metric === request.metrics[0])) {
    return 'number_card';
  }
  return 'table';
}

function addSimpleCharts(report, request, type, sources) {
  for (const { block, dataset } of sources) {
    const yKeys = numericMetrics(dataset, request);
    const xKey = type === 'line' ? 'date' : dataset.columns.some(column => column.key === 'name') ? 'name' : 'profileId';

    if (!yKeys.length || !dataset.columns.some(column => column.key === xKey)) {
      addWarning(report, `${type} requires an available ${type === 'line' ? 'date and numeric metric' : 'label and numeric metric'}.`);
      continue;
    }

    if (type === 'line') {
      dataset.rows.sort((left, right) => String(left.date).localeCompare(String(right.date)));
    }
    if (isPartialPage(dataset)) {
      addWarning(report, 'Chart displays the returned table page only; additional rows are not included.');
    }
    addChart(report, { type, title: `${block.title} · returned rows`, datasetId: dataset.id, xKey, yKeys });
  }
}

function addDonuts(report, request, sources) {
  for (const { dataset } of sources) {
    const metric = numericMetrics(dataset, request)[0];
    const label = dataset.columns.some(column => column.key === 'placement') ? 'placement' : 'name';

    // Ratios are not additive shares, and a partial page is not a whole total.
    if (!metric || !['spend', 'sales', 'orders', 'clicks', 'impressions'].includes(metric)
      || isPartialPage(dataset) || dataset.rows.some(row => !Number.isFinite(row[metric]) || row[metric] < 0)) {
      addWarning(report, 'Share chart requires complete returned groups and known, nonnegative additive values; the table remains available.');
      continue;
    }

    const groups = new Map();
    for (const row of dataset.rows) {
      const name = String(row[label] || row.name || 'Unknown');
      groups.set(name, (groups.get(name) || 0) + row[metric]);
    }
    const rows = [...groups].map(([name, value]) => ({ name, [metric]: value }))
      .sort((left, right) => right[metric] - left[metric] || left.name.localeCompare(right.name));
    if (!rows.some(row => row[metric] > 0)) {
      addWarning(report, 'All returned share values are zero; no share chart is shown.');
      continue;
    }
    if (rows.length > 5) {
      rows.splice(4, rows.length - 4, { name: 'Other', [metric]: rows.slice(4).reduce((sum, row) => sum + row[metric], 0) });
    }
    const id = uniqueId(report, 'chart_share');
    const columns = [
      { key: 'name', label: 'Group', type: 'string' },
      { ...dataset.columns.find(column => column.key === metric) },
    ];
    if (addDataset(report, { id, currencyCode: dataset.currencyCode, columns, rows })) {
      addChart(report, { type: 'donut', title: `Observed ${metric} share · ${scopeLabel(dataset)}`, datasetId: id,
        xKey: 'name', yKeys: [metric], valueKey: metric });
    }
  }
}

function addGroupedBars(report, request, sources) {
  const groups = new Map();

  for (const { block, dataset } of sources) {
    const period = /comparison\s*$/.test(block.title) ? 'previous' : 'current';
    const metric = numericMetrics(dataset, request)[0];
    if (!metric) continue;
    const first = dataset.rows[0];
    const groupKey = JSON.stringify([dataset.currencyCode, first.adType, metric]);

    if (!groups.has(groupKey)) {
      groups.set(groupKey, { metric, currencyCode: dataset.currencyCode,
        unit: dataset.columns.find(column => column.key === metric).unit, rows: new Map(), partial: false });
    }
    const group = groups.get(groupKey);
    group.partial = group.partial || Boolean(isPartialPage(dataset));

    for (const row of dataset.rows) {
      const identity = IDENTITY_KEYS.map(key => row[key] ?? null);
      // Different calendar dates have no identity-preserving before/after join.
      if (row.date !== undefined) {
        addWarning(report, 'Grouped comparison requires entity groups; use a line chart for date trends.');
        continue;
      }
      const key = JSON.stringify(identity);
      if (!group.rows.has(key)) {
        const name = `${row.profileId || ''} ${row.adType || ''} · ${row.name || row.campaignId || row.profileId || 'Unknown'}`.slice(0, 500);
        group.rows.set(key, { name, currentValue: null, previousValue: null });
      }
      group.rows.get(key)[`${period}Value`] = row[metric];
    }
  }

  for (const group of groups.values()) {
    if (!group.rows.size) continue;
    if (group.rows.size > 1000) {
      addWarning(report, 'Comparison chart is limited to the first 1000 returned entities.');
    }
    const rows = [...group.rows.values()].slice(0, 1000);
    const id = uniqueId(report, 'chart_comparison');
    const columns = [
      { key: 'name', label: 'Entity', type: 'string' },
      { key: 'currentValue', label: `Current ${group.metric}`, type: 'number', unit: group.unit, nullable: true },
      { key: 'previousValue', label: `Previous ${group.metric}`, type: 'number', unit: group.unit, nullable: true },
    ];
    if (group.partial) {
      addWarning(report, 'Comparison chart includes returned table pages only; unmatched or absent values remain unknown.');
    }
    if (report.status === 'partial') {
      addWarning(report, 'Comparison bars show observed period values; coverage warnings still apply and reliable change may be unavailable.');
    }
    if (addDataset(report, { id, currencyCode: group.currencyCode, columns, rows })) {
      addChart(report, { type: 'grouped_bar', title: `${group.metric} by entity · ${group.currencyCode}`,
        datasetId: id, xKey: 'name', yKeys: ['currentValue', 'previousValue'] });
    }
  }
}

function applyPresentation(report, request) {
  const result = structuredClone(report);
  if (['unavailable', 'empty', 'error'].includes(result.status)) return result;
  const type = requestedPresentation(result, request);
  const sources = sourceTables(result);

  if (type === 'number_card') {
    const selected = result.cards.filter(card => request.metrics.includes(card.metric));
    if (!selected.length) addWarning(result, 'Number cards require calculated summary metrics; available evidence is shown in tables.');
    for (const card of selected) {
      if (!result.blocks.some(block => block.type === 'number_card' && block.metricId === card.id)) {
        addChart(result, { type: 'number_card', metricId: card.id });
      }
    }
  } else if (['line', 'bar'].includes(type)) {
    addSimpleCharts(result, request, type, sources);
  } else if (type === 'grouped_bar') {
    addGroupedBars(result, request, sources);
  } else if (type === 'donut') {
    addDonuts(result, request, sources);
  } else if (type === 'heatmap' && !result.blocks.some(block => block.type === 'heatmap')) {
    addWarning(result, 'Heatmap requires observed weekday/hour cells; available evidence is shown in tables.');
  }
  return result;
}

module.exports = { applyPresentation };
