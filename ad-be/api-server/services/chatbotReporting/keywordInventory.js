'use strict';

// The existing keywords collection stores report-date performance rows. Its
// listing job does not record a completed, full-account snapshot or confirmed
// empty result. Reading it cannot prove that a search term is not a keyword.
async function readKeywordInventory() {
  return {
    rows: [],
    verified: false,
    dataAsOf: null,
    missingInputs: ['A complete, dated current keyword inventory is required.'],
  };
}

module.exports = { readKeywordInventory };
