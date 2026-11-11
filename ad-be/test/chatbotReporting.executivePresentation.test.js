'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SYSTEM_PROMPT,
  stripMarkdownTables,
  stripProvisionalDisclaimers,
  createChatService,
} = require('../api-server/services/chatbotReporting.chat');

test('SYSTEM_PROMPT explicitly forbids markdown tables and provisional disclaimers in Turn 2', () => {
  assert.match(SYSTEM_PROMPT, /DO NOT GENERATE MARKDOWN TABLES OR PIPE TABLES/i);
  assert.match(SYSTEM_PROMPT, /DO NOT REPEAT THE TABULAR DATA OR LIST ALL METRICS/i);
  assert.match(SYSTEM_PROMPT, /WRITE A CLEAN, CONCISE EXECUTIVE NARRATIVE/i);
  assert.match(SYSTEM_PROMPT, /NEVER include internal system disclaimers such as "Data may be incomplete"/i);
});

test('stripMarkdownTables eliminates markdown pipe tables and table headers', () => {
  const input = `Yesterday's search-term data shows some strong converting terms, but I can't yet confirm which ones are missing from your keyword list, and I can't judge efficiency without a target ACOS.

Top search terms by orders (4 Nov 2026, SP, INR)

| Search term | Orders | Spend | Sales | ACOS | CVR | Clicks |
|:---|---:|---:|---:|---:|---:|---:|
| linen pants for man | 15 | ₹1,316.23 | ₹7,684.74 | 17.13% | 4.39% | 342 |
| co ord sets for woman | 9 | ₹516.98 | ₹5,424.74 | 9.53% | 3.59% | 251 |
| shirts for men stylish | 7 | ₹320.15 | ₹2,287.62 | 13.99% | 3.70% | 189 |

What stands out (observed only):
- Low-spend terms with high conversion: "tagdo shorts for men" and "sweatshirt for man" converted well.
- See the full list in the table below.`;

  const output = stripMarkdownTables(input);
  assert.doesNotMatch(output, /\|/);
  assert.doesNotMatch(output, /Top search terms by orders/);
  assert.match(output, /Yesterday's search-term data shows/);
  assert.match(output, /What stands out \(observed only\):/);
  assert.match(output, /Low-spend terms with high conversion/);
});

test('stripMarkdownTables eliminates KPI summary table', () => {
  const input = `Yesterday (4 Nov 2026) for your Sponsored Products account, in INR:

| Metric | Value |
|:---|---:|
| Spend | ₹41,033.47 |
| Sales | ₹2,55,539.57 |
| ACOS | 16.06% |
| ROAS | 6.23x |
| Orders | 487 |
| CPC | ₹2.52 |
| CVR | 2.99% |

Things to keep in mind:
- Ad spend reached ₹41,033.47 with a strong ROAS of 6.23x.`;

  const output = stripMarkdownTables(input);
  assert.doesNotMatch(output, /\|/);
  assert.match(output, /Things to keep in mind:/);
  assert.match(output, /Ad spend reached/);
});

test('stripProvisionalDisclaimers eliminates incomplete coverage and provisional disclaimers', () => {
  const input = `Things to keep in mind:
- Data may be incomplete. The report flags that data completeness for this account is unverified, so these totals are provisional.
- Sales and orders may still rise. The attribution window is 14 days.
- No comparison yet.`;

  const output = stripProvisionalDisclaimers(input);
  assert.doesNotMatch(output, /provisional/i);
  assert.doesNotMatch(output, /data completeness/i);
  assert.doesNotMatch(output, /data may be incomplete/i);
  assert.match(output, /Sales and orders may still rise/);

  const englishAtGlance = `Here are the available results. Some data is incomplete, so these figures may change.

Spend: INR 41,033.47`;
  const cleanEnglish = stripProvisionalDisclaimers(englishAtGlance);
  assert.doesNotMatch(cleanEnglish, /Some data is incomplete/i);
  assert.match(cleanEnglish, /Spend: INR 41,033.47/);

  const gujlishAtGlance = `Ahiya uplabdh results chhe. Ketalik mahiti adhuri chhe, tethi aa aakda badlai shake chhe (Amazon attribution window chalu chhe).

Total spend ₹1,250 hato.`;
  const cleanGujlish = stripProvisionalDisclaimers(gujlishAtGlance);
  assert.doesNotMatch(cleanGujlish, /adhuri chhe/i);
  assert.doesNotMatch(cleanGujlish, /badlai shake chhe/i);
  assert.match(cleanGujlish, /Total spend ₹1,250 hato/);
});

test('Chat service cleans markdown tables and provisional warnings from Turn 2 output', async () => {
  const mockReport = {
    status: 'complete',
    category: 'summary',
    scope: { profiles: [{ profileId: '123', currencyCode: 'INR' }] },
    periods: { current: { fromDate: '2026-11-04', toDate: '2026-11-04' } },
    cards: [
      { metric: 'spend', value: 41033.47, unit: 'currency' },
      { metric: 'sales', value: 255539.57, unit: 'currency' },
      { metric: 'acos', value: 16.06, unit: 'percent' },
      { metric: 'roas', value: 6.23, unit: 'multiple' },
      { metric: 'orders', value: 487, unit: 'count' },
    ],
  };

  const aiWithTable = {
    requestTurn: async ({ toolResults }) => {
      if (!toolResults) {
        return {
          toolCalls: [{
            id: 'tc_1',
            name: 'run_report',
            arguments: { category: 'summary', period: { preset: 'yesterday' } },
          }],
        };
      }
      return {
        text: `Yesterday your SP campaigns achieved strong results.

| Metric | Value |
|---|---|
| Spend | ₹41033.47 |
| Sales | ₹255539.57 |
| ACOS | 16.06% |

Things to keep in mind:
- Data may be incomplete. The report flags that data completeness for this account is unverified, so these totals are provisional.
- Total orders reached 487 across all campaigns.`,
      };
    },
  };

  const service = createChatService({
    aiProvider: aiWithTable,
    reportService: async () => mockReport,
  });

  const response = await service({
    message: 'How did yesterday go?',
    profileIds: ['123'],
  }, { profileIds: ['123'], currencyCode: 'INR' });

  assert.equal(response.isReport, true);
  assert.doesNotMatch(response.replyMessage, /\|/);
  assert.doesNotMatch(response.replyMessage, /provisional/i);
  assert.doesNotMatch(response.replyMessage, /data completeness/i);
  assert.match(response.replyMessage, /Yesterday your SP campaigns achieved strong results/);
  assert.match(response.replyMessage, /Total orders reached 487 across all campaigns/);
});
