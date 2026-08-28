// src/optimizer/io/saveClient.ts — staged project save (NDJSON)
export interface SaveProgress {
  phase: string;
  message: string;
  ok?: boolean;
  error?: string;
  files?: string[];
}

export async function saveOptimizedToProject(opts: {
  glb: ArrayBuffer;
  family: string;
  name: string;
  overwrite: boolean;
  emitLodChain: boolean;
  onProgress?: (event: SaveProgress) => void;
  signal?: AbortSignal;
}): Promise<SaveProgress> {
  const params = new URLSearchParams({
    family: opts.family,
    name: opts.name,
    overwrite: opts.overwrite ? '1' : '0',
    lod: opts.emitLodChain ? '1' : '0',
  });
  const res = await fetch(`/api/dev/optimizer/save?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'model/gltf-binary' },
    body: opts.glb,
    signal: opts.signal,
  });
  if (!res.body) {
    const text = await res.text();
    throw new Error(text || `Save failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let last: SaveProgress = { phase: 'start', message: 'Saving…' };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      last = JSON.parse(trimmed) as SaveProgress;
      opts.onProgress?.(last);
      if (last.phase === 'error' || last.ok === false) {
        throw new Error(last.error || last.message || 'Save failed');
      }
    }
  }
  if (buf.trim()) {
    last = JSON.parse(buf.trim()) as SaveProgress;
    opts.onProgress?.(last);
  }
  if (last.phase === 'error' || last.ok === false) {
    throw new Error(last.error || last.message || 'Save failed');
  }
  return last;
}

export function downloadGlb(buffer: ArrayBuffer, fileName: string): void {
  const blob = new Blob([new Uint8Array(buffer)], { type: 'model/gltf-binary' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.glb') ? fileName : `${fileName}.glb`;
  a.click();
  URL.revokeObjectURL(url);
}
