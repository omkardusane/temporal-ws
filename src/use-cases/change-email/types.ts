export const CHANGE_EMAIL_TASK_QUEUE = 'change-email';

export function changeEmailWorkflowId(userId: string): string {
  return `change-email-${userId}`;
}

export type ChangeEmailInput = { userId: string; newEmail: string };

export type ChangeEmailPhase = 'validating' | 'awaiting-old-otp' | 'awaiting-new-otp' | 'committing' | 'done';

export type ChangeEmailResult =
  | { status: 'completed' }
  | { status: 'email-taken' }
  | { status: 'expired'; phase: ChangeEmailPhase }
  | { status: 'too-many-attempts'; phase: ChangeEmailPhase }
  | { status: 'cancelled'; phase: ChangeEmailPhase };
