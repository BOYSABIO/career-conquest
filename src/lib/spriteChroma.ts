type KeyOpts = { sumMax?: number; channelMax?: number };

/** Flood from image edges through very dark pixels; clear alpha (black / near-black BG). */
export function keyOutEdgeConnectedNearBlack(
  source: CanvasImageSource,
  opts?: KeyOpts
): HTMLCanvasElement {
  const sumMax = opts?.sumMax ?? 34;
  const channelMax = opts?.channelMax ?? 12;

  const w =
    source instanceof HTMLImageElement
      ? source.naturalWidth
      : (source as HTMLCanvasElement).width;
  const h =
    source instanceof HTMLImageElement
      ? source.naturalHeight
      : (source as HTMLCanvasElement).height;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || w < 1 || h < 1) return canvas;

  ctx.drawImage(source, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  const n = w * h;
  const visited = new Uint8Array(n);

  const isTunnel = (p: number) => {
    const r = d[p];
    const g = d[p + 1];
    const b = d[p + 2];
    const a = d[p + 3];
    if (a < 8) return false;
    return r + g + b < sumMax && Math.max(r, g, b) <= channelMax;
  };

  const qx: number[] = [];
  const qy: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = y * w + x;
    if (visited[i]) return;
    if (!isTunnel(i * 4)) return;
    visited[i] = 1;
    qx.push(x);
    qy.push(y);
  };

  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }

  for (let qi = 0; qi < qx.length; qi++) {
    push(qx[qi] + 1, qy[qi]);
    push(qx[qi] - 1, qy[qi]);
    push(qx[qi], qy[qi] + 1);
    push(qx[qi], qy[qi] - 1);
  }

  for (let i = 0; i < n; i++) {
    if (!visited[i]) continue;
    d[i * 4 + 3] = 0;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

type WhiteOpts = { sumMin?: number; minChannel?: number };

/** Flood from edges through near-white pixels (white / light gray BG). */
export function keyOutEdgeConnectedNearWhite(
  source: CanvasImageSource,
  opts?: WhiteOpts
): HTMLCanvasElement {
  const sumMin = opts?.sumMin ?? 718;
  const minChannel = opts?.minChannel ?? 188;

  const w =
    source instanceof HTMLImageElement
      ? source.naturalWidth
      : (source as HTMLCanvasElement).width;
  const h =
    source instanceof HTMLImageElement
      ? source.naturalHeight
      : (source as HTMLCanvasElement).height;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || w < 1 || h < 1) return canvas;

  ctx.drawImage(source, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  const n = w * h;
  const visited = new Uint8Array(n);

  const isTunnel = (p: number) => {
    const r = d[p];
    const g = d[p + 1];
    const b = d[p + 2];
    const a = d[p + 3];
    if (a < 8) return false;
    return r + g + b >= sumMin && Math.min(r, g, b) >= minChannel;
  };

  const qx: number[] = [];
  const qy: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = y * w + x;
    if (visited[i]) return;
    if (!isTunnel(i * 4)) return;
    visited[i] = 1;
    qx.push(x);
    qy.push(y);
  };

  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }

  for (let qi = 0; qi < qx.length; qi++) {
    push(qx[qi] + 1, qy[qi]);
    push(qx[qi] - 1, qy[qi]);
    push(qx[qi], qy[qi] + 1);
    push(qx[qi], qy[qi] - 1);
  }

  for (let i = 0; i < n; i++) {
    if (!visited[i]) continue;
    d[i * 4 + 3] = 0;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** White BG first, then black (bear exports may use either). */
export function keyBearBackground(img: HTMLImageElement): HTMLCanvasElement {
  const afterWhite = keyOutEdgeConnectedNearWhite(img);
  return keyOutEdgeConnectedNearBlack(afterWhite);
}
