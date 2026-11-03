export class UnknownUserError extends Error {
  constructor(userId: string) {
    super(`unknown user: ${userId}`);
    this.name = 'UnknownUserError';
  }
}

export interface UsersServiceClient {
  getEmail(userId: string): Promise<string>;
  isEmailTaken(email: string): Promise<boolean>;
  updateEmail(userId: string, newEmail: string, idempotencyKey: string): Promise<void>;
}

export interface MockUser {
  userId: string;
  email: string;
  idempotencyKeys: Set<string>;
}

export class MockUsersServiceClient implements UsersServiceClient {
  private users = new Map<string, MockUser>();

  public seed(userId: string, email: string): void {
    this.users.set(userId, { userId, email, idempotencyKeys: new Set() });
  }

  public getEmail(userId: string): Promise<string> {
    const user = this.users.get(userId);
    if (!user) {
      return Promise.reject(new UnknownUserError(userId));
    }
    return Promise.resolve(user.email);
  }

  public isEmailTaken(email: string): Promise<boolean> {
    const target = email.toLowerCase();
    const taken = [...this.users.values()].some((user) => user.email.toLowerCase() === target);
    return Promise.resolve(taken);
  }

  public updateEmail(userId: string, newEmail: string, idempotencyKey: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      return Promise.reject(new UnknownUserError(userId));
    }
    if (user.idempotencyKeys.has(idempotencyKey)) {
      return Promise.resolve();
    }
    user.email = newEmail;
    user.idempotencyKeys.add(idempotencyKey);
    return Promise.resolve();
  }

  public list(): { userId: string; email: string }[] {
    return [...this.users.values()].map(({ userId, email }) => ({ userId, email }));
  }
}
