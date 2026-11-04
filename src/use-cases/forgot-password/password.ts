import { randomBytes, scryptSync } from 'node:crypto';

// Runs in the caller (API / reset page), never in the workflow: the plain password must
// not reach workflow history, only this salted hash does.
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 32).toString('hex')}`;
}
