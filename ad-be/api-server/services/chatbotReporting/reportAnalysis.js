'use strict';

const { analyzePerformance } = require('./performanceAnalysis');
const { analyzeOpportunities } = require('./opportunityAnalysis');
const { analyzeSpecial } = require('./specialAnalysis');

const DEFAULT_OPTIONS = Object.freeze({
  minClicks: 20,
  minOrders: 3,
  minImpressions: 100,
  maxImpressions: 1000,
  changePercent: 50,
  maxDataAgeHours: 48,
});

function analysisOptions(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Analysis configuration must be an object');
  }

  const allowedKeys = [...Object.keys(DEFAULT_OPTIONS), 'targetAcos'];

  for (const [key, value] of Object.entries(input)) {
    const validKey = allowedKeys.includes(key);
    const validValue = typeof value === 'number' && Number.isFinite(value) && value > 0;

    if (!validKey || !validValue) {
      throw new TypeError('Invalid analysis configuration');
    }

    if (['minClicks', 'minOrders', 'minImpressions', 'maxImpressions'].includes(key)
        && !Number.isSafeInteger(value)) {
      throw new TypeError('Analysis sample limits must be safe positive integers');
    }
  }

  return Object.freeze({ ...DEFAULT_OPTIONS, ...input });
}

function analyzeReport(input) {
  const category = input.request.category;

  if (['summary', 'comparison', 'change', 'unusual'].includes(category)) {
    return analyzePerformance(input);
  }

  if (['waste', 'growth'].includes(category)) {
    return analyzeOpportunities(input);
  }

  return analyzeSpecial(input);
}

function appendAnalysis(state, result, scopeLabel) {
  for (const warning of result.warnings) {
    state.warnings.add(`${scopeLabel}: ${warning}`.slice(0, 500));
  }

  for (const missing of result.missingInputs) {
    state.missingInputs.add(`${scopeLabel}: ${missing}`.slice(0, 200));
  }

  // Analysis output has the same scope and hard limits as the base report.
  const cardIds = new Set();
  const datasetIds = new Set();

  for (const card of result.cards) {
    if (state.cards.length >= 100) {
      state.warnings.add('Additional analysis cards omitted at the response limit.');
      break;
    }

    state.cards.push(card);
    cardIds.add(card.id);
  }

  for (const dataset of result.datasets) {
    if (state.datasets.length >= 20) {
      state.warnings.add('Additional analysis tables omitted at the response limit.');
      break;
    }

    state.datasets.push(dataset);
    datasetIds.add(dataset.id);
  }

  for (const block of result.blocks) {
    const validReference = block.type === 'text'
      || (block.type === 'number_card' ? cardIds.has(block.metricId) : datasetIds.has(block.datasetId));

    if (validReference && state.blocks.length < 99) {
      state.blocks.push(block);
    }
  }

  for (const text of result.text) {
    state.analysisText.push(`${scopeLabel}: ${text}`);
  }

  for (const followUp of result.followUps) {
    if (state.followUps.length < 10) {
      state.followUps.push(followUp);
    }
  }
}

module.exports = { analysisOptions, analyzeReport, appendAnalysis };
