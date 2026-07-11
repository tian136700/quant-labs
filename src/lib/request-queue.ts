/** 串行执行异步任务，保证同一队列内请求按顺序、一次一个发出 */
export class RequestQueue {
  private tail: Promise<void> = Promise.resolve();
  private pending = 0;
  private listeners = new Set<(pending: number) => void>();

  /** 当前排队 + 正在执行的任务数 */
  get pendingCount(): number {
    return this.pending;
  }

  subscribe(listener: (pending: number) => void): () => void {
    this.listeners.add(listener);
    listener(this.pending);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setPending(next: number): void {
    this.pending = next;
    for (const listener of this.listeners) {
      listener(this.pending);
    }
  }

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    this.setPending(this.pending + 1);
    const result = this.tail.then(async () => {
      try {
        return await task();
      } finally {
        this.setPending(this.pending - 1);
      }
    });
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

/** 日语单词页勾选/保存等写操作共用，避免并发 POST 压垮 Worker */
export const jpVocabSaveQueue = new RequestQueue();
export const enVocabSaveQueue = new RequestQueue();
/** 日语新课页上课老师/日程等写操作串行，便于乐观更新后后台同步 */
export const jpLessonSaveQueue = new RequestQueue();
