import type { ChangeEmailPhase } from './types.js';
import { defineQuery, defineSignal } from '@temporalio/workflow';

export const submitOldOtp = defineSignal<[string]>('submitOldOtp');

export const submitNewOtp = defineSignal<[string]>('submitNewOtp');

export const cancel = defineSignal('cancel');

export const getState = defineQuery<{
  phase: ChangeEmailPhase;
  attemptsLeft: number;
}>('getState');
