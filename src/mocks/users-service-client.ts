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
      throw new Error(`unknown user: ${userId}`);
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
      return Promise.reject(new Error(`unknown user: ${userId}`));
    }
    if (user.idempotencyKeys.has(idempotencyKey)) {
      return Promise.resolve();
    }
    user.email = newEmail;
    user.idempotencyKeys.add(idempotencyKey);
    return Promise.resolve();
  }
}
