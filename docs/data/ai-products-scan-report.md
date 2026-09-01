# AI product scan report

Verified locally on 2026-09-21. The final sample contains 40 real pricing pages: five accepted Jev classifications in each of eight application categories. Candidate labels did not override model results.

All 40 latest scans succeeded with HTTP 200, rubric `pricing-intelligence-v5`, exact model `jev-1.13.0`, and 46 persisted answers each. Each page DO contains the captured version and evaluation. D1 has the matching run, rubric, and model in its latest summary. The rubric v5 D1 default migration was applied locally.

## Category coverage

| Category                | Accepted pages |
| ----------------------- | -------------: |
| coding_assistants       |              5 |
| app_builders            |              5 |
| customer_support_agents |              5 |
| voice_agents            |              5 |
| video_generation        |              5 |
| workflow_agent_builders |              5 |
| sales_prospecting       |              5 |
| meeting_assistants      |              5 |

## Successful source versions

Run IDs identify the archived local captures. The URL manifest is in [ai-products.json](ai-products.json). Runtime databases, source artifacts, and credentials are not committed.

| Product      | Source                                         | Run ID                                 | Source bytes |
| ------------ | ---------------------------------------------- | -------------------------------------- | -----------: |
| Cursor       | [Pricing](https://cursor.com/pricing)          | `1a85ce1c-5b45-4f38-aec6-26503fe5a4d2` |         7639 |
| Devin        | [Pricing](https://devin.ai/pricing)            | `8b4feef2-701c-495d-a22b-fb2e3c884bc0` |         6218 |
| CodeRabbit   | [Pricing](https://www.coderabbit.ai/pricing)   | `121d9c88-7962-45bb-b950-8861814c712b` |        15216 |
| Qodo         | [Pricing](https://www.qodo.ai/pricing/)        | `09ebdaef-b5bc-45fa-b80d-5755b86556c2` |        16660 |
| Tabnine      | [Pricing](https://www.tabnine.com/pricing/)    | `5bb027e9-5eb6-445e-af19-545698ac526b` |        15644 |
| Lovable      | [Pricing](https://lovable.dev/pricing)         | `aa372a10-a650-4569-9f41-beb4240071e8` |        13956 |
| Bolt         | [Pricing](https://bolt.new/pricing)            | `b371e3df-7d7a-48ae-9fe6-3f7ad4441756` |         8674 |
| Emergent     | [Pricing](https://emergent.sh/pricing)         | `f2030e0b-4fe4-415d-afc1-3342f14c8021` |         8784 |
| Base44       | [Pricing](https://base44.com/pricing)          | `a637cdfc-1ee4-4dfa-b4c9-02ffbfba1b09` |        12804 |
| v0           | [Pricing](https://v0.app/pricing)              | `9cb5a6c5-7a0f-403e-9729-8f1f223ed8ba` |         6619 |
| Fin          | [Pricing](https://fin.ai/pricing)              | `a86fce53-8a78-4f45-907f-d5cbc88f75be` |        18344 |
| Chatbase     | [Pricing](https://www.chatbase.co/pricing)     | `a0d96943-f1e1-488f-8ba4-4d047d648187` |        26869 |
| DocsBot      | [Pricing](https://docsbot.ai/pricing)          | `2f3008bd-9b55-4755-b316-f26bfdc4109d` |        40098 |
| SiteGPT      | [Pricing](https://sitegpt.ai/pricing)          | `8a944a1e-60c7-4fa2-afff-14035ab74b52` |        34683 |
| Chatling     | [Pricing](https://chatling.ai/pricing)         | `e055f6d3-7226-4666-8beb-a941379efa5d` |        20897 |
| Retell AI    | [Pricing](https://www.retellai.com/pricing)    | `0bad9f7f-ad45-4c59-a325-2be243f85c9c` |        35631 |
| Vapi         | [Pricing](https://vapi.ai/pricing)             | `63b46f5c-be43-4438-b100-8fa67e042c49` |        10268 |
| Bland        | [Pricing](https://www.bland.ai/pricing)        | `97fee831-fb1a-4a58-b466-f1083b72944f` |         9693 |
| Synthflow    | [Pricing](https://synthflow.ai/pricing)        | `733e6115-b5b1-4de0-95d6-574024310cb3` |        16985 |
| Autocalls    | [Pricing](https://autocalls.ai/pricing)        | `22a2a5c9-5bdb-4906-bef6-398fe00179c8` |        31401 |
| Runway       | [Pricing](https://runway.com/pricing)          | `89ba064f-1aee-4af0-aa45-cbfaed5102d8` |        11408 |
| HeyGen       | [Pricing](https://www.heygen.com/pricing)      | `4cacff89-3098-4f83-a399-67fc03fb0f01` |        29181 |
| Luma         | [Pricing](https://lumalabs.ai/pricing)         | `56069b52-bd67-437f-b042-5b1ddce1857f` |        13449 |
| InVideo      | [Pricing](https://invideo.io/pricing/)         | `aed0b9ad-c7ac-4810-b2e5-e2696d4247bd` |        15300 |
| Pika         | [Pricing](https://pika.art/pricing)            | `7643d123-b657-4ee6-9598-67d5edbb882d` |        14927 |
| Relevance AI | [Pricing](https://relevanceai.com/pricing)     | `bb741435-5340-40ae-a4c0-c8a69c6ea2cf` |         6636 |
| Gumloop      | [Pricing](https://www.gumloop.com/pricing)     | `286e9408-e23f-427a-baa2-756e2313b717` |         6608 |
| MindStudio   | [Pricing](https://www.mindstudio.ai/pricing)   | `5bc7044a-f6d3-4d17-a27d-c4a1d12c9b8c` |        66807 |
| Dify         | [Pricing](https://dify.ai/pricing)             | `75f1bca6-991f-4167-b147-7d88d8f8ce47` |        15591 |
| Dust         | [Pricing](https://dust.tt/home/pricing)        | `539cca47-b60f-4ef5-8f15-8e2deb32d3a4` |        10710 |
| Clay         | [Pricing](https://www.clay.com/pricing)        | `2910d792-13bb-4fe5-a415-cf2bee329382` |        68842 |
| Artisan      | [Pricing](https://www.artisan.co/pricing)      | `6154085b-85d8-477b-80de-a89ad39c928d` |        18285 |
| AiSDR        | [Pricing](https://aisdr.com/pricing/)          | `15e195b9-d9b2-45ac-ac50-b15b3495ebfc` |        67709 |
| Regie.ai     | [Pricing](https://regie.ai/pricing)            | `17b4c86f-1f81-4df5-ac44-c975a5ce0769` |         7715 |
| Amplemarket  | [Pricing](https://www.amplemarket.com/pricing) | `89f92f3d-5147-4a96-a08a-0cff09e80b42` |        68311 |
| Fireflies    | [Pricing](https://fireflies.ai/pricing)        | `24f21f28-715b-4f34-ac28-ae1bc4ec036d` |        32084 |
| Otter        | [Pricing](https://otter.ai/pricing)            | `d9be2580-79ad-49c8-86e6-63232f8e4729` |        23735 |
| Fathom       | [Pricing](https://www.fathom.ai/pricing)       | `ac5741f7-bc4c-443d-aedd-a5a79faba8a8` |        18409 |
| MeetGeek     | [Pricing](https://meetgeek.ai/pricing)         | `effa20fe-c0c3-4481-82dd-f368a1a2d78d` |        53655 |
| Granola      | [Pricing](https://www.granola.ai/pricing)      | `da9489e9-0a13-4edb-bb69-36ac52539f7b` |        19833 |

## Deferred candidates

These attempts remain recorded locally and are excluded from current aggregates because they have no successful current-rubric evaluation. Replacements retain the same intended product category.

| Candidate                                       | Reason                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------- |
| [Replit](https://replit.com/pricing)            | Capture returned HTTP 403                                                   |
| [CallFluent](https://callfluent.com/pricing/)   | Captured source exceeded the 256 KiB transport limit                        |
| [Synthesia](https://www.synthesia.io/pricing)   | Jev gateway rejected the full-source evaluation with 7003: User Input Error |
| [Salesforge](https://www.salesforge.ai/pricing) | Jev gateway rejected the full-source evaluation with 7003: User Input Error |
| [Instantly](https://instantly.ai/pricing)       | Jev gateway rejected the full-source evaluation with 7003: User Input Error |

Replit was replaced with Emergent; CallFluent with Autocalls; Synthesia with Luma; Salesforge and then Instantly with Amplemarket. Gateway error 7003 does not identify the exact rejection cause, so it is not reported as a confirmed token overflow.

## Scan corrections

- Replaced the evaluation character limit with a conservative 72 KiB Markdown source cap and one Jev request containing the complete rubric. Jev 1.13 allows 64k tokens for the full request and 32k tokens for the state plus the longest question; the byte cap leaves room for the rubric and structured response. No answers are published if the complete request fails.
- Recovered five app-builder workflows interrupted by local hot reload through the local workflow restart API. The temporary local maintenance route was removed after scans completed.
- Existing failed attempts and their captured sources were retained. No synthetic observations or forced category assignments were inserted.

The provider documents a 64k-token request budget and 32k tokens for state plus the longest question: [TypeSafe model reference](https://docs.typesafe.ai/models). Transport byte limits are not estimates of those token limits.

## Verification and limits

- The benchmark overview shows 40 current AI application pages; all eight category controls show five. Model APIs remain separate.
- The coding category shows counts and withholds percentages below ten classified pages. The overview exposes the denominator and uncertain count for each metric.
- 154 automated tests, type checks, production build, lint, and changed-file formatting passed. Category specification and code reviews passed.
- Five examples per category are a convenience sample, not evidence of market prevalence.
- Weekly change reports need compatible captures in two adjacent completed UTC weeks. These new pages have no such history yet.
- The existing weekly change verifier still treats changed sources above 24,000 characters or its conservative request budget as uncertain. Longer pages can appear in current practice aggregates, but need a separate verifier expansion before their changes can be published.
- Exact numeric price statistics remain deferred. This release compares charging structure and published commercial terms.

## Reproduce

Start the local stack with its D1 migrations. Sign in and add the URLs from `ai-products.json` through Your pages. Wait for successful scans, then open `/benchmarks`. Provider results and captures can change; the manifest records candidates, not expected answers. No remote deployment or push was performed.
