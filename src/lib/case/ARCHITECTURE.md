# Maverick — Module Architecture

## Overview

The qualification logic is organized into **engine modules** under `src/lib/case/`.
Each engine is a pure-function library with no React dependencies, making them
testable, composable, and reusable across pages.

## Module Map

```
src/lib/case/
├── index.ts                 # Barrel export — import everything from '@/lib/case'
├── types.ts                 # Unified Case types (CaseApplicant, CaseProperty, etc.)
├── income-engine.ts         # Total qualifying income calculation
├── liability-engine.ts      # Total monthly liability burden calculation
├── applicant-engine.ts      # Age, tenor eligibility, binding tenor, segment resolution
├── stage1-engine.ts         # Stage 1: DBR / core financial eligibility per bank
├── stage2-engine.ts         # Stage 2: Bank policy checks (re-exports from policy-checks.ts)
├── product-engine.ts        # Product matching: selects best product per bank
└── snapshot-service.ts      # Saves a qualification case to Supabase
```

## Data Flow

```
User Input (React state)
    │
    ▼
┌─────────────────┐
│  Adapter Layer   │  Converts UI entries (IncomeEntry, LiabilityEntry)
│                  │  to engine types (CaseIncomeField, CaseLiabilityField)
└─────────────────┘
    │
    ▼
┌─────────────────┐     ┌─────────────────┐
│  Income Engine   │     │ Liability Engine │
│  calcTotalIncome │     │ calcTotalLiab.   │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
    ┌────────────────────────────────┐
    │     Stage 1 Engine (runStage1) │  ← Banks from Supabase
    │  DBR calc, min salary, sort    │
    └──────────────┬─────────────────┘
                   │
                   ▼
    ┌────────────────────────────────┐
    │   Stage 2 Engine (policy checks)│  ← policy_terms from Supabase
    │  Min salary, nationality, etc.  │
    └──────────────┬─────────────────┘
                   │
                   ▼
    ┌────────────────────────────────┐
    │   Product Engine (matching)     │  ← products from Supabase
    │  Best rate per eligible bank    │
    └──────────────┬─────────────────┘
                   │
                   ▼
    ┌────────────────────────────────┐
    │   Snapshot Service (save)       │  → Supabase (applicants, property_details,
    │   Persists case + JSONB snapshot│    income_fields, liability_fields,
    └────────────────────────────────┘    qualification_results)
```

## Key Types

- **`QualificationCase`** — the unified working entity containing applicant, property,
  income, liabilities, and co-borrowers.
- **`CaseBankResult`** — output of Stage 1 per bank (DBR, eligibility, stress EMI).
- **`PolicyCheckResult`** — output of Stage 2 per check (pass/fail/warn with summary).
- **`ProductData`** — matched product with rate, fees, insurance for cost comparison.

## Adding New Modules

To add a new engine (e.g., refinance logic, LRD calculations, non-resident DAB):

1. Create `src/lib/case/your-engine.ts` with pure functions.
2. Export from `src/lib/case/index.ts`.
3. Call from the page or existing engines — no need to modify the Case type
   unless new data fields are required.
4. If new applicant/property fields are needed, extend the types in `types.ts`.

## Adapter Pattern

Pages use **UI-specific types** (`IncomeEntry`, `LiabilityEntry`, `CoBorrowerData`)
for form binding. Thin adapter functions (`toEngineIncome`, `toEngineLiability`,
`toEngineCoBorrowers`) convert these to engine types before calling engine functions.

This keeps the engines decoupled from React/form concerns while maintaining
backward compatibility with existing UI components.

## Legacy Compatibility

`BankEligibilityTable` and `CostBreakdownSection` still expect the old `Bank`
interface shape (`bank_name` not `bankName`). The page creates `legacyBanks` and
`legacyBankResults` adapters. These can be migrated incrementally.
