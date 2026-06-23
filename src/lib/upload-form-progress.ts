export type UploadProgressEvent = {
  /** 浏览器 → 服务器传文件；服务器保存 R2 */
  phase: "uploading" | "processing" | "done";
  percent: number;
  loaded: number;
  total: number;
};

type UploadFormProgressOptions = {
  url: string;
  form: FormData;
  headers?: Record<string, string>;
  onProgress?: (event: UploadProgressEvent) => void;
};

type UploadFormProgressResult = {
  ok: boolean;
  status: number;
  data: unknown;
};

export function uploadFormWithProgress(
  options: UploadFormProgressOptions
): Promise<UploadFormProgressResult> {
  const { url, form, headers = {}, onProgress } = options;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;

    let lastTotal = 0;

    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }

    const emit = (event: UploadProgressEvent) => {
      if (event.total > 0) lastTotal = event.total;
      onProgress?.(event);
    };

    xhr.upload.onloadstart = () => {
      emit({ phase: "uploading", percent: 0, loaded: 0, total: 0 });
    };

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        emit({
          phase: "uploading",
          percent: 0,
          loaded: event.loaded,
          total: 0,
        });
        return;
      }
      const percent = Math.round((event.loaded / event.total) * 100);
      emit({
        phase: "uploading",
        percent,
        loaded: event.loaded,
        total: event.total,
      });
    };

    xhr.upload.onload = (event) => {
      const total = event.lengthComputable ? event.total : lastTotal || event.loaded;
      emit({
        phase: "processing",
        percent: 100,
        loaded: total,
        total,
      });
    };

    xhr.onload = () => {
      let data: unknown = null;
      const text = xhr.responseText || "";
      if (text) {
        try {
          data = JSON.parse(text) as unknown;
        } catch {
          data = { error: text };
        }
      }
      emit({
        phase: "done",
        percent: 100,
        loaded: lastTotal,
        total: lastTotal,
      });
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        data,
      });
    };

    xhr.onerror = () => reject(new Error("upload_failed"));
    xhr.onabort = () => reject(new Error("upload_aborted"));
    xhr.send(form);
  });
}

export function formatUploadBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
