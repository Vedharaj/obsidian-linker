export interface JobErrorItem {
  timestamp: number;
  stage: string;
  path?: string;
  message: string;
}

export class ErrorReporter {
  private errors: JobErrorItem[] = [];
  private maxStoredErrors = 500;

  public report(stage: string, message: string, path?: string): void {
    this.errors.push({
      timestamp: Date.now(),
      stage,
      path,
      message,
    });

    if (this.errors.length > this.maxStoredErrors) {
      this.errors.shift();
    }
  }

  public get count(): number {
    return this.errors.length;
  }

  public getAll(): JobErrorItem[] {
    return [...this.errors];
  }

  public getRecent(limit = 10): JobErrorItem[] {
    return this.errors.slice(-limit);
  }

  public clear(): void {
    this.errors = [];
  }
}
