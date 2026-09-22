# Numeric price scan report

Local scan verification on 2026-09-22. This is a curated sample, not a representative market survey.

All 40 product scans completed successfully. Numeric collection completed for 35 products: 9 had accepted baseline offers and 26 had no accepted baseline. Five numeric evaluations were unavailable. Existing practice results remain published.

| Product    | Published amount | Currency           | Commitment | Basis | Source                                                                                                                                  |
| ---------- | ---------------- | ------------------ | ---------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Cursor     | 20 / month       | DOLLAR_UNSPECIFIED | monthly    | flat  | [Capture](http://localhost:4000/api/public/pages/93f97825-96df-4ac1-8bad-76e5698ffbfd/runs/7087a4ab-29d3-4803-9276-557b8a0c5cc8/source) |
| Devin      | 20 / month       | DOLLAR_UNSPECIFIED | monthly    | flat  | [Capture](http://localhost:4000/api/public/pages/6dcee0a2-65c8-4d84-b739-58b169bec8d8/runs/ef7177ad-9942-47f4-b90d-ccc1a42cf04d/source) |
| CodeRabbit | 24 / month       | DOLLAR_UNSPECIFIED | annual     | seat  | [Capture](http://localhost:4000/api/public/pages/cec35700-c364-4c5b-aa9c-7db2b863b638/runs/1a317462-e8d7-4b6b-882b-216d57b7ac2a/source) |
| Lovable    | 22 / month       | GBP                | monthly    | flat  | [Capture](http://localhost:4000/api/public/pages/3677eab2-b740-4482-a7d2-6e43cc160140/runs/aec95971-eafe-4ceb-bf26-2754efeaa61c/source) |
| Bolt       | 25 / month       | DOLLAR_UNSPECIFIED | monthly    | flat  | [Capture](http://localhost:4000/api/public/pages/f477639a-d8b3-4665-9464-8972814b3aab/runs/c5e2b9b6-f5df-44af-b6d0-92dbd5e20bd4/source) |
| Base44     | 16 / month       | DOLLAR_UNSPECIFIED | annual     | flat  | [Capture](http://localhost:4000/api/public/pages/ff11d9c8-03d6-4231-b434-80a33f8cee65/runs/3509b433-3e33-4215-a424-11b21884e5a2/source) |
| DocsBot    | 49 / month       | DOLLAR_UNSPECIFIED | monthly    | flat  | [Capture](http://localhost:4000/api/public/pages/439f32c4-4ca0-40a3-839d-6d410c6ea907/runs/4953d924-98a1-4938-9207-6888b8f012c3/source) |
| Chatling   | 25 / month       | DOLLAR_UNSPECIFIED | monthly    | flat  | [Capture](http://localhost:4000/api/public/pages/fd626315-deb7-46ff-a492-2901f4c25838/runs/669a7abd-ff75-4e85-83da-c01948d46ed3/source) |
| HeyGen     | 29 / month       | DOLLAR_UNSPECIFIED | monthly    | flat  | [Capture](http://localhost:4000/api/public/pages/2bbbce98-bec4-45c0-ab83-04f98870de94/runs/3798cc78-f6ae-42be-bad5-e100d25f4cc6/source) |

Every published amount’s evidence string was checked against its exact archived source. Eight offers retain an unspecified dollar denomination. Lovable’s capture uses GBP; capture location can change published currency. No category has three accepted offers in the same currency, commitment and charging-unit group, so medians and ranges remain withheld.

No included allowance or overage rate passed the attribution policy in this scan. Missing amounts do not mean zero, free, or unlimited. This release collects recurring base offers, not standalone pay-as-you-go rates, credit-pack purchases or total-cost simulations.

Numeric evaluation unavailable: Retell AI, Autocalls, MindStudio, Clay, AiSDR.

Method: numeric-prices-v1, Jev jev-1.13.0 where a model decision was needed. Required semantic checks use 0.90; optional allowance/overage attribution uses 0.95. Literal values and bare dollar markers are checked in code. Thresholds are policy choices, not measured extraction accuracy. The repeated model pass is not independent statistical evidence.

The 0.95 baseline gate initially rejected clear published terms. The final 0.90 baseline policy improves coverage while retaining separate eligibility, billing, period and charging-unit checks. A labeled holdout set is still needed to measure precision and recall before stronger accuracy claims.

Versions and decision audits remain in each page Durable Object. D1 stores latest numeric summaries without audits and category aggregates. No remote deployment was performed.
