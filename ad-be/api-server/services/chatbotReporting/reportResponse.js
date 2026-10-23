'use strict';

// Build the existing response format from collected source evidence.
const {
  validateReportResponse
} = require('../../contracts/chatbotReporting.contract');
const {
  DEFINITIONS
} = require('./reportDefinitions');
const { applyPresentation } = require('./reportPresentation');

function glossaryReport(request, reportId) {
  const text = request.metrics.map(metric => DEFINITIONS[metric]).join('\n\n');

  const report = {
    schemaVersion: '1.0',
    reportId,
    category: 'definition',
    dataOrigin: 'reporting',
    status: 'ok',
    scope: null,
    periods: [],
    freshness: {
      status: 'complete',
      dataAsOf: null,
      sourceRefs: [{
        name: 'Approved reporting metric definitions v1'
      }],
      missingInputs: []
    },
    text,
    cards: [],
    datasets: [],
    blocks: [{
      type: 'text',
      text
    }],
    warnings: [],
    followUps: []
  };

  return validateReportResponse(report);
}

function createReportState() {
  return {
    cards: [],
    datasets: [],
    blocks: [],
    analysisText: [],
    followUps: [],
    warnings: new Set(),
    missingInputs: new Set(),
    sourceRefs: new Map(),
    timestamps: [],
    sourceIndex: 0,
    allVerified: true,
    hasUsableEvidence: false
  };
}

function reportStatus(state) {
  const hasRows = state.datasets.some(dataset => {
    if (dataset.id.endsWith('_time_grid')) {
      return dataset.rows.some(cell => cell.value !== null);
    }
    return dataset.rows.length > 0;
  });
  const hasObservedGroups = state.datasets.some(dataset => dataset.page?.total > 0);
  const complete = state.allVerified && !state.missingInputs.size && !state.warnings.size;

  if (!hasRows && !hasObservedGroups && !state.hasUsableEvidence && !complete) {
    return {
      status: 'unavailable',
      complete
    };
  }

  if (complete) {
    return {
      status: hasRows || hasObservedGroups ? 'ok' : 'empty',
      complete
    };
  }

  return {
    status: 'partial',
    complete
  };
}

function reportText(request, status, analysisText = []) {
  if (analysisText.length) {
    return analysisText.join('\n\n').slice(0, 10000);
  }

  const availability = status === 'unavailable' ? 'Required report data is unavailable.' : 'Review source coverage and attribution warnings before interpreting the figures.';
  const analysisPending = ['change', 'waste', 'growth', 'unusual'].includes(request.category) ? 'This step returns reporting evidence and explicit filters; automatic explanations, opportunity checks and anomaly analysis are added in Step 5.' : '';

  // Keep the existing wording/spacing so this cleanup does not alter API output.
  return `Read-only ${request.category} report. Each table keeps its own profile, currency, ad type and period. ${availability} ${analysisPending}`.trim();
}

// When a question is deliberately withheld (e.g. profit needs product costs,
// hourly conversion needs verified orders, budget exhaustion needs budget history,
// "today" is still partial), don't dead-end. Offer the honestly-labelled report the
// engine CAN verify as a one-click follow-up, so the user still gets usable data.
function buildAlternativeFollowUps(request, scope, missingInputs = []) {
  if (!scope || !Array.isArray(scope.profiles) || scope.profiles.length === 0) {
    return [];
  }
  const profileIds = scope.profiles.map(p => p.profileId);
  const adTypes = Array.isArray(request.adTypes) && request.adTypes.length ? request.adTypes : ['SP'];
  const period = request.period || { preset: 'last_7_days' };
  const base = { schemaVersion: '1.0', profileIds, adTypes };
  const metrics = Array.isArray(request.metrics) ? request.metrics : [];
  const groupBy = Array.isArray(request.groupBy) ? request.groupBy : [];
  const alts = [];

  // Too much data to load in time: offer the same report over a single day so the
  // query can complete, rather than leaving the user at a dead end. (The narrative
  // also asks them to pick a shorter range or one campaign.)
  const tooLarge = missingInputs.some(input => /too much|shorter date range|too large|row limit/i.test(input));
  if (tooLarge && request.period?.preset !== 'yesterday') {
    const oneDay = { ...base, category: request.category, metrics, period: { preset: 'yesterday' } };
    if (groupBy.length) oneDay.groupBy = groupBy;
    alts.push({ label: 'Try just yesterday', request: oneDay });
  }

  // Intraday "today" -> same report for the last complete day.
  if (request.period && request.period.preset === 'today') {
    const yesterday = { ...base, category: request.category, period: { preset: 'yesterday' }, metrics };
    if (groupBy.length) yesterday.groupBy = groupBy;
    alts.push({ label: 'Check yesterday instead', request: yesterday });
  }

  if (request.category === 'products' && metrics.some(m => ['profit', 'tacos', 'stock', 'days_of_stock'].includes(m))) {
    alts.push({
      label: 'Show ad spend & sales by product',
      request: { ...base, category: 'products', period, groupBy: ['product'], metrics: ['spend', 'sales', 'orders', 'clicks'] },
    });
  } else if (request.category === 'time' && metrics.some(m => ['cvr', 'orders', 'aov'].includes(m))) {
    alts.push({
      label: 'Show spend & clicks by hour',
      request: { ...base, category: 'time', period, groupBy: ['hour', 'weekday'], metrics: ['clicks', 'spend', 'cpc'], sort: { field: 'clicks', direction: 'desc' }, presentation: 'heatmap' },
    });
  } else if (request.category === 'growth' && groupBy.includes('campaign')) {
    alts.push({
      label: 'Show campaign spend & sales',
      request: { ...base, category: 'waste', period, groupBy: ['campaign'], metrics: ['spend', 'sales', 'clicks', 'orders'] },
    });
  }

  return alts.slice(0, 3);
}

function buildDefaultFollowUps(request, scope, status, missingInputs = []) {
  if (status === 'error') {
    return [];
  }
  if (status === 'unavailable') {
    return buildAlternativeFollowUps(request, scope, missingInputs);
  }
  if (!scope || !Array.isArray(scope.profiles) || scope.profiles.length === 0) {
    return [];
  }
  const profileIds = scope.profiles.map(p => p.profileId);
  const adTypes = Array.isArray(request.adTypes) && request.adTypes.length ? request.adTypes : ['SP'];
  const period = request.period || { preset: 'last_7_days' };

  if (request.category === 'summary') {
    return [
      {
        label: 'Break down by campaign',
        request: {
          schemaVersion: '1.0',
          category: 'change',
          profileIds,
          adTypes,
          period,
          groupBy: ['campaign'],
          metrics: ['spend', 'sales', 'acos', 'cpc']
        }
      },
      {
        label: 'Check wasted spend',
        request: {
          schemaVersion: '1.0',
          category: 'waste',
          profileIds,
          adTypes,
          period,
          groupBy: ['keyword'],
          metrics: ['spend', 'sales', 'clicks', 'orders'],
          filters: [
            {
              field: 'spend',
              operator: 'gt',
              value: 30,
              currencyCode: scope.profiles[0]?.currencyCode || 'USD'
            },
            {
              field: 'sales',
              operator: 'eq',
              value: 0,
              currencyCode: scope.profiles[0]?.currencyCode || 'USD'
            }
          ]
        }
      },
      {
        label: 'Find growth opportunities',
        request: {
          schemaVersion: '1.0',
          category: 'growth',
          profileIds,
          adTypes,
          period,
          groupBy: ['search_term'],
          metrics: ['spend', 'sales', 'orders', 'clicks', 'cvr']
        }
      }
    ];
  }

  if (request.category === 'change') {
    return [
      {
        label: 'Show keywords',
        request: {
          schemaVersion: '1.0',
          category: 'change',
          profileIds,
          adTypes,
          period,
          groupBy: ['keyword'],
          metrics: ['spend', 'sales', 'acos', 'cpc']
        }
      },
      {
        label: 'Performance summary',
        request: {
          schemaVersion: '1.0',
          category: 'summary',
          profileIds,
          adTypes,
          period,
          metrics: ['spend', 'sales', 'acos', 'roas', 'orders', 'cpc', 'cvr']
        }
      }
    ];
  }

  if (request.category === 'waste') {
    return [
      {
        label: 'Break down by placement',
        request: {
          schemaVersion: '1.0',
          category: 'waste',
          profileIds,
          adTypes,
          period,
          groupBy: ['placement'],
          metrics: ['spend', 'sales', 'clicks', 'orders']
        }
      },
      {
        label: 'Find growth opportunities',
        request: {
          schemaVersion: '1.0',
          category: 'growth',
          profileIds,
          adTypes,
          period,
          groupBy: ['search_term'],
          metrics: ['spend', 'sales', 'orders', 'clicks', 'cvr']
        }
      }
    ];
  }

  if (request.category === 'growth') {
    return [
      {
        label: 'Check wasted spend',
        request: {
          schemaVersion: '1.0',
          category: 'waste',
          profileIds,
          adTypes,
          period,
          groupBy: ['keyword'],
          metrics: ['spend', 'sales', 'clicks', 'orders']
        }
      },
      {
        label: 'Performance summary',
        request: {
          schemaVersion: '1.0',
          category: 'summary',
          profileIds,
          adTypes,
          period,
          metrics: ['spend', 'sales', 'acos', 'roas', 'orders', 'cpc', 'cvr']
        }
      }
    ];
  }

  return [
    {
      label: 'Performance summary',
      request: {
        schemaVersion: '1.0',
        category: 'summary',
        profileIds,
        adTypes,
        period,
        metrics: ['spend', 'sales', 'acos', 'roas', 'orders', 'cpc', 'cvr']
      }
    }
  ];
}

function buildReportResponse(state, request, scope, periods, reportId) {
  const {
    status,
    complete
  } = reportStatus(state);
  const text = reportText(request, status, state.analysisText || []);
  const freshnessStatus = status === 'unavailable' ? 'unavailable' : complete ? 'complete' : 'partial';

  const cards = ['unavailable', 'empty'].includes(status) ? [] : (state.cards || []);
  const cardIds = new Set(cards.map(c => c.id));

  const datasets = status === 'unavailable'
    ? state.datasets.filter(d => d.rows.length === 0)
    : state.datasets;
  const datasetIds = new Set(datasets.map(d => d.id));

  const hasSpecializedTables = state.blocks.some(b =>
    b.type === 'table' && b.datasetId && /(?:opportunities|no_sales|high_acos|movers)/.test(b.datasetId)
  );

  const blocks = [
    { type: 'text', text },
    ...state.blocks.filter(b => {
      if (b.type === 'number_card') return cardIds.has(b.metricId);
      if (b.type === 'table' && hasSpecializedTables && /^report_\d+$/.test(b.datasetId || '')) {
        return false;
      }
      if (b.datasetId) return datasetIds.has(b.datasetId);
      return true;
    })
  ];

  const followUps = (state.followUps && state.followUps.length > 0)
    ? state.followUps
    : buildDefaultFollowUps(request, scope, status, [...state.missingInputs]);

  const report = {
    schemaVersion: '1.0',
    reportId,
    category: request.category,
    dataOrigin: 'reporting',
    status,
    scope,
    periods,
    freshness: {
      status: freshnessStatus,
      dataAsOf: state.timestamps.sort()[0] || null,
      sourceRefs: [...state.sourceRefs.values()].slice(0, 50),
      missingInputs: [...state.missingInputs].slice(0, 50)
    },
    text,
    cards,
    datasets,
    blocks,
    warnings: [...state.warnings].slice(0, 50),
    followUps
  };

  return validateReportResponse(applyPresentation(report, request));
}

module.exports = {
  glossaryReport,
  createReportState,
  buildDefaultFollowUps,
  buildAlternativeFollowUps,
  buildReportResponse
};
