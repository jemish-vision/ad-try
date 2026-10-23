'use strict';

const METRICS = ['spends', 'sales', 'clicks', 'impressions'];
const COUNT_METRICS = ['clicks', 'impressions'];
const IDENTITY_FIELDS = [
  'reportDate',
  'startTime',
  'campaignId',
  'adGroupId',
  'keywordId',
  'placement',
  'marketplaceId'
];

function numberValue(field) {
  return {
    $convert: {
      input: field,
      to: 'double',
      onError: -1,
      onNull: -1
    }
  };
}

function validIdentifier(field) {
  const number = numberValue(field);
  const text = {
    $convert: {
      input: field,
      to: 'string',
      onError: '',
      onNull: ''
    }
  };
  const isIntegerString = {
    $and: [
      { $eq: [{ $type: field }, 'string'] },
      { $regexMatch: { input: text, regex: '^[1-9][0-9]*$' } }
    ]
  };

  return {
    $and: [
      { $or: [{ $isNumber: field }, isIntegerString] },
      { $gt: [number, 0] },
      { $lte: [number, Number.MAX_SAFE_INTEGER] },
      { $eq: [number, { $trunc: number }] }
    ]
  };
}

function validMetric(field, isCount) {
  const number = numberValue(field);
  const requirements = [
    { $isNumber: field },
    { $gte: [number, 0] },
    { $lte: [number, Number.MAX_VALUE] }
  ];

  if (isCount) {
    requirements.push(
      { $eq: [number, { $trunc: number }] },
      { $lte: [number, Number.MAX_SAFE_INTEGER] }
    );
  }

  return {
    $or: [
      { $eq: [{ $ifNull: [field, null] }, null] },
      { $and: requirements }
    ]
  };
}

function sourceIdentity() {
  const identity = {};

  for (const field of IDENTITY_FIELDS) {
    const missingValue = ['placement', 'marketplaceId'].includes(field) ? '' : null;
    identity[field] = { $ifNull: [`$${field}`, missingValue] };
  }

  return identity;
}

function sourceValidation(currencyCode, includeSales) {
  const selectedMetrics = METRICS.filter(metric => metric !== 'sales' || includeSales);

  return [
    validIdentifier('$campaignId'),
    validIdentifier('$adGroupId'),
    {
      $or: [
        { $eq: [{ $type: '$currency' }, 'missing'] },
        { $eq: ['$currency', currencyCode] }
      ]
    },
    ...selectedMetrics.map(metric => validMetric(`$${metric}`, COUNT_METRICS.includes(metric)))
  ];
}

function metricTotals() {
  const totals = {};

  for (const metric of METRICS) {
    const field = `$row.${metric}`;
    const isMissing = { $eq: [{ $ifNull: [field, null] }, null] };

    totals[metric] = { $sum: field };
    totals[`${metric}Missing`] = {
      $max: { $cond: [isMissing, 1, 0] }
    };
  }

  return totals;
}

function hourlyPipeline(filter, currencyCode, includeSales) {
  const validInputs = sourceValidation(currencyCode, includeSales);

  return [
    { $match: filter },
    // Validate original rows and identity counts before collapsing their grain.
    {
      $group: {
        _id: sourceIdentity(),
        count: { $sum: 1 },
        row: { $first: '$$ROOT' },
        invalid: {
          $max: { $cond: [{ $and: validInputs }, 0, 1] }
        }
      }
    },
    {
      $group: {
        _id: {
          reportDate: '$_id.reportDate',
          startTime: '$_id.startTime'
        },
        invalid: { $max: '$invalid' },
        duplicate: {
          $max: { $cond: [{ $gt: ['$count', 1] }, 1, 0] }
        },
        forms: {
          $addToSet: {
            $cond: [
              { $eq: ['$row.isHourlyAggregated', true] },
              'consolidated',
              'raw'
            ]
          }
        },
        updatedAt: { $max: '$row.updatedAt' },
        ...metricTotals()
      }
    },
    { $sort: { '_id.reportDate': 1, '_id.startTime': 1 } }
  ];
}

function bucketConflict(row) {
  if (row.duplicate) {
    return 'DUPLICATE_HOURLY_IDENTITY';
  }

  if (row.invalid) {
    return 'INVALID_HOURLY_SOURCE';
  }

  return null;
}

function bucketMetric(row, metric) {
  return row[`${metric}Missing`] ? null : row[metric] ?? null;
}

module.exports = {
  hourlyPipeline,
  bucketConflict,
  bucketMetric
};
