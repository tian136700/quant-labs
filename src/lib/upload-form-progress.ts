type UploadFormProgressOptions = {
  url: string;
  form: FormData;
  headers?: Record<string, string>;
  onProgress?: (percent: number) => void;
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

    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }

    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) return;
      const pct = Math.min(99, Math.round((event.loaded / event.total) * 100));
      onProgress(pct);
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
