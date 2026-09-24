# Design simplification implementation plan

**Goal:** Make the approved category-to-source research flow direct and readable.

**Architecture:** Use URL search state for category and comparison question. Reuse existing Button, Field and DropdownMenu components. A small shared select field uses the native browser control.

**Tech stack:** React, TanStack Router, TanStack Query, shadcn Base UI, CSS.

- [x] Add `lib/comparison-search.ts` for validated category and topic search state, plus `components/category-picker.tsx` and `components/select-field.tsx`.
- [x] Update home, benchmarks and changes to use category selection. Replace the chart list with one chosen topic and add policy row filters.
- [x] Update header and footer links to carry category. Use the existing DropdownMenu for mobile navigation and add Your pages to the account menu.
- [x] Update profile and dashboard copy, layered headings that represent saved versions and collection disclosures. Preserve directory filters when opening and returning from a page record.
- [x] Update existing CSS for compact headings, controls, mobile menu, readable labels and profile spacing. Remove unused ticker code.
- [x] Run formatting on changed files, lint, web type/build checks and existing directory-filter tests. Verify the full research flow in the running browser at desktop and phone widths.

No commits or deployment are needed for this local UI review. The approved audit is the design approval for this work.

Verification: web TypeScript check, frontend lint, five directory-filter tests and client/server production builds passed. Browser checks covered desktop and mobile category selection, policy-to-directory counts, company collection details, keyboard menu navigation and category persistence. Phone layouts fit at 320px and 390px without horizontal page overflow.
