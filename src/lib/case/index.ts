/**
 * Case module barrel export.
 * Import engines from here: import { calcTotalIncome, runStage1 } from '@/lib/case';
 */

export * from './types';
export * from './income-engine';
export * from './liability-engine';
export * from './applicant-engine';
export * from './stage1-engine';
export * from './stage2-engine';
export * from './product-engine';
export { saveQualificationSnapshot } from './snapshot-service';
