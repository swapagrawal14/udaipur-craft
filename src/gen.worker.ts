import { generateChunk } from './gen';

self.onmessage = (e: MessageEvent) => {
  const { cx, cz } = e.data as { cx: number; cz: number };
  const data = generateChunk(cx, cz);
  (self as unknown as Worker).postMessage({ cx, cz, data }, [data.buffer]);
};
