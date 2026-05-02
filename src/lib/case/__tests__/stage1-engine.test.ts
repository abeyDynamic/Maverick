/**
 * Stage 1 engine tests — covering DBR/stress-rate normalization and bank gating.
 *
 * Phase 0 hotfix coverage:
 *   B01 — DBR limit was inflated 100x by stage1-engine
 *   B02 — Stress rate was inflated 100x by stage1-engine
 *   B17 — Bank max tenor not enforced
 *   B18 — Loan range not enforced in Stage 1
 *
 * Convention: bank.dbrLimit and bank.baseStressRate are display percents
 * (e.g. 50 = 50%, 7.37 = 7.37%) — matches what BankManagement.tsx writes to DB.
 */
import { describe, it, expect } from 'vitest';
import { runStage1 } from '../stage1-engine';
import type { CaseBank } from '../types';

function makeBank(overrides: Partial<CaseBank> = {}): CaseBank {
  return {
    id: 'bank-1',
    bankName: 'Test Bank',
    baseStressRate: 7.37,
    minSalary: 15000,
    dbrLimit: 50,
    maxTenorMonths: 300,
    minLoanAmount: 500_000,
    maxLoanAmount: 5_000_000,
    ...overrides,
  };
}

describe('Stage 1 — DBR/stress normalization (B01, B02)', () => {
  it('passes a healthy case (DBR ~31% under 50% limit)', () => {
    const [r] = runStage1([makeBank()], 30_000, 2_000, 1_000_000, 300, 7.37);
    expect(r.dbr).toBeGreaterThan(25);
    expect(r.dbr).toBeLessThan(40);
    expect(r.dbrLimit).toBe(50);
    expect(r.dbrMet).toBe(true);
    expect(r.eligible).toBe(true);
  });

  it('FAILS a borderline case at DBR ~60% above 50% limit', () => {
    const [r] = runStage1([makeBank()], 20_000, 1_000, 1_500_000, 300, 7.37);
    expect(r.dbr).toBeGreaterThan(55);
    expect(r.dbr).toBeLessThan(65);
    expect(r.dbrMet).toBe(false);
    expect(r.eligible).toBe(false);
  });

  it('FAILS a tight case at DBR ~78% above 50% limit', () => {
    const [r] = runStage1([makeBank()], 15_000, 3_000, 1_200_000, 300, 7.37);
    expect(r.dbr).toBeGreaterThan(70);
    expect(r.dbr).toBeLessThan(85);
    expect(r.dbrMet).toBe(false);
    expect(r.eligible).toBe(false);
  });

  it('produces a sane stress EMI (close to industry math)', () => {
    const [r] = runStage1([makeBank()], 30_000, 0, 1_000_000, 300, 7.37);
    expect(r.stressEMI).toBeGreaterThan(6_500);
    expect(r.stressEMI).toBeLessThan(8_500);
  });

  it('uses the bank-specific stress rate when present', () => {
    const [a, b] = runStage1(
      [
        makeBank({ id: 'a', bankName: 'A', baseStressRate: 6.5 }),
        makeBank({ id: 'b', bankName: 'B', baseStressRate: 8.5 }),
      ],
      30_000, 0, 1_000_000, 300, 7.37,
    );
    const aBank = a.bank.bankName === 'A' ? a : b;
    const bBank = a.bank.bankName === 'A' ? b : a;
    expect(aBank.stressEMI).toBeLessThan(bBank.stressEMI);
    expect(aBank.stressRate).toBe(6.5);
    expect(bBank.stressRate).toBe(8.5);
  });

  it('falls back to the fallback stress rate when bank has none', () => {
    const [r] = runStage1(
      [makeBank({ baseStressRate: null as unknown as number })],
      30_000, 0, 1_000_000, 300, 7.37,
    );
    expect(r.stressRate).toBe(7.37);
    expect(r.stressEMI).toBeGreaterThan(6_500);
    expect(r.stressEMI).toBeLessThan(8_500);
  });

  it('flags min-salary failure when income is below the threshold', () => {
    const [r] = runStage1([makeBank({ minSalary: 25_000 })], 20_000, 0, 1_000_000, 300, 7.37);
    expect(r.minSalaryMet).toBe(false);
    expect(r.eligible).toBe(false);
  });

  it('treats DBR just under the limit as passing', () => {
    const [r] = runStage1([makeBank({ minSalary: 0 })], 14_620, 0, 1_000_000, 300, 7.37);
    expect(r.dbr).toBeGreaterThan(49.5);
    expect(r.dbr).toBeLessThan(50);
    expect(r.dbrMet).toBe(true);
  });
});

describe('Stage 1 — bank max tenor enforcement (B17)', () => {
  it('clamps tenor by bank.maxTenorMonths when applicant tenor exceeds it', () => {
    const [longBank, shortBank] = runStage1(
      [
        makeBank({ id: 'long', bankName: 'LongTenor', maxTenorMonths: 300 }),
        makeBank({ id: 'short', bankName: 'ShortTenor', maxTenorMonths: 180 }),
      ],
      30_000, 0, 1_000_000, 300, 7.37,
    );
    const longResult = longBank.bank.bankName === 'LongTenor' ? longBank : shortBank;
    const shortResult = longBank.bank.bankName === 'LongTenor' ? shortBank : longBank;
    expect(shortResult.stressEMI).toBeGreaterThan(longResult.stressEMI);
  });

  it('does not lengthen tenor beyond the applicant cap', () => {
    const [r] = runStage1([makeBank({ maxTenorMonths: 360 })], 30_000, 0, 1_000_000, 240, 7.37);
    expect(r.stressEMI).toBeGreaterThan(7_500);
    expect(r.stressEMI).toBeLessThan(8_400);
  });
});

describe('Stage 1 — loan range enforcement (B18)', () => {
  it('marks bank ineligible when loan is below bank min', () => {
    const [r] = runStage1([makeBank({ minLoanAmount: 500_000 })], 30_000, 0, 300_000, 300, 7.37);
    expect(r.eligible).toBe(false);
    expect(r.loanInRange).toBe(false);
  });

  it('marks bank ineligible when loan is above bank max', () => {
    const [r] = runStage1([makeBank({ maxLoanAmount: 5_000_000 })], 80_000, 0, 8_000_000, 300, 7.37);
    expect(r.eligible).toBe(false);
    expect(r.loanInRange).toBe(false);
  });

  it('passes loanInRange when loan sits inside the bank window', () => {
    const [r] = runStage1(
      [makeBank({ minLoanAmount: 500_000, maxLoanAmount: 5_000_000 })],
      30_000, 0, 1_000_000, 300, 7.37,
    );
    expect(r.loanInRange).toBe(true);
  });
});
