/**
 * Cloudflare Workers 类型（避免本地未安装 @cloudflare/workers-types 时报错）
 */
declare global {
  interface D1Database {
    prepare(query: string): D1PreparedStatement;
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  }

  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = unknown>(colName?: string): Promise<T | null>;
    all<T = unknown>(): Promise<D1Result<T>>;
    run<T = unknown>(): Promise<D1Result<T>>;
  }

  interface D1Result<T = unknown> {
    results?: T[];
    success?: boolean;
    meta?: Record<string, unknown>;
  }

  interface R2HTTPMetadata {
    contentType?: string;
    contentDisposition?: string;
  }

  interface R2PutOptions {
    httpMetadata?: R2HTTPMetadata;
  }

  interface R2ObjectBody {
    body: ReadableStream | null;
    arrayBuffer(): Promise<ArrayBuffer>;
    text(): Promise<string>;
    json<T>(): Promise<T>;
    httpEtag?: string;
    etag?: string;
  }

  interface R2Object {
    key: string;
    httpEtag?: string;
    etag?: string;
  }

  interface R2ListedObject {
    key: string;
  }

  interface R2ListOptions {
    limit?: number;
    prefix?: string;
    cursor?: string;
  }

  interface R2Objects {
    objects: R2ListedObject[];
    truncated: boolean;
    cursor?: string;
  }

  interface R2Bucket {
    get(key: string): Promise<R2ObjectBody | null>;
    put(
      key: string,
      value: ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob,
      options?: R2PutOptions
    ): Promise<R2Object>;
    head(key: string): Promise<R2Object | null>;
    list(options?: R2ListOptions): Promise<R2Objects>;
    delete(keys: string | string[]): Promise<void>;
  }
}

export {};
