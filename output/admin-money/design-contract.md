# Admin money workspace

Job: inspect committed postings and investigate uncertain provider outcomes without
moving money. Use the existing admin shell and ivory/forest palette, restrained
rows, tabular amounts, explicit currency labels, amber investigation indicators
and a persistent Read-only note. No charts imply trends the API cannot establish.

Primary flow: overview → queue category → record detail → linked ledger posting.
Ledger search/filter is a GET form; no JavaScript mutation controls. Balances are
normal-sign account balances, never an estimate of external bank cash. Keep
currencies separate and distinguish provider event amounts from checkout totals.

Targets 1440x1000 / 390x844. Grid rows collapse on mobile; amounts and long provider
references wrap without document overflow. States: streamed loading; empty queue;
failed request with retry; partial overview if summary unavailable but links remain;
unknown event currency handled as raw minor units; permissions and missing records;
loaded/balanced transaction and explicit integrity warning.
