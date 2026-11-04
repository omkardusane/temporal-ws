import type { ForgotPasswordPhase, ResetPasswordRequest, ResetPasswordResponse } from './types.js';
import { defineQuery, defineSignal, defineUpdate } from '@temporalio/workflow';

// an Update, not a Signal: the reset page needs to know right away if the token was accepted
export const resetPassword = defineUpdate<ResetPasswordResponse, [ResetPasswordRequest]>('resetPassword');

export const resend = defineSignal('resend');

export const cancel = defineSignal('cancel');

export const getState = defineQuery<{
  phase: ForgotPasswordPhase;
  attemptsLeft: number;
  resendsLeft: number;
}>('getState');
