export class RetryableStatus extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`HTTP ${status}`);
    this.name = "RetryableStatus";
    this.status = status;
  }
}

export function isRetryableStatus(error: unknown): boolean {
  return error instanceof RetryableStatus && (error.status === 429 || error.status === 529);
}

export async function withStatusRetry<T>(
  fn: () => Promise<T>,
  options: { retries: number; baseMs: number; sleep: (ms: number) => Promise<void> },
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryableStatus(error) || attempt >= options.retries) throw error;
      await options.sleep(options.baseMs * 2 ** attempt);
      attempt += 1;
    }
  }
}
