export interface EmailClient {
  send(to: string, subject: string, body: string): Promise<void>;
}
export type SentEmail = { to: string; subject: string; body: string };

export class MockEmailClient implements EmailClient {
  sent: SentEmail[] = [];

  private pendingFailures = 0;

  public failNext(n: number): void {
    this.pendingFailures = n;
  }

  public async send(to: string, subject: string, body: string): Promise<void> {
    if (this.pendingFailures > 0) {
      this.pendingFailures -= 1;
      throw new Error('mock email send failed');
    }
    this.sent.push({ to, subject, body });
  }

  public lastTo(addr: string): SentEmail | undefined {
    for (let i = this.sent.length - 1; i >= 0; i -= 1) {
      if (this.sent[i].to === addr) {
        return this.sent[i];
      }
    }
    return undefined;
  }

  public clear(): void {
    this.sent = [];
    this.pendingFailures = 0;
  }
}
