/** 串行执行异步任务，保证同一队列内请求按顺序、一次一个发出 */
export class RequestQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

/** 日语单词页勾选/保存等写操作共用，避免并发 POST 压垮 Worker */
export const jpVocabSaveQueue = new RequestQueue();
