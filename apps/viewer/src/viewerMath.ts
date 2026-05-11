export type ViewportSize = {
  width: number;
  height: number;
};

export type RendererViewport = ViewportSize & {
  devicePixelRatio: number;
  rendererPixelRatio: number;
};

export type RectLike = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type BoundsSize = {
  x: number;
  y: number;
  z: number;
};

export type OrthographicFitView = {
  viewWidth: number;
  viewHeight: number;
  aspect: number;
};

export function cappedDevicePixelRatio(devicePixelRatio: number, max = 2): number {
  const finite = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(finite, max);
}

export function rendererViewportFromElement(
  element: { clientWidth: number; clientHeight: number },
  devicePixelRatio: number
): RendererViewport {
  return {
    width: Math.max(1, Math.floor(element.clientWidth)),
    height: Math.max(1, Math.floor(element.clientHeight)),
    devicePixelRatio: Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1,
    rendererPixelRatio: cappedDevicePixelRatio(devicePixelRatio)
  };
}

export function pointerClientToNdc(clientX: number, clientY: number, rect: RectLike): { x: number; y: number } {
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height, 1);
  const x = ((clientX - rect.left) / width) * 2 - 1;
  const y = -(((clientY - rect.top) / height) * 2 - 1);
  return {
    x: x === 0 ? 0 : x,
    y: y === 0 ? 0 : y
  };
}

export function computeOrthographicFitView(
  boundsSize: BoundsSize,
  viewport: ViewportSize,
  padding = 1.18
): OrthographicFitView {
  const aspect = Math.max(viewport.width / Math.max(viewport.height, 1), 0.1);
  const maxDimension = Math.max(boundsSize.x, boundsSize.y, boundsSize.z, 1);
  const paddedWidth = Math.max(boundsSize.x, maxDimension * 0.04, 1) * padding;
  const paddedHeight = Math.max(boundsSize.y, maxDimension * 0.04, 1) * padding;
  const boxAspect = paddedWidth / paddedHeight;
  const flatLayoutWidth = boxAspect > 6 ? paddedHeight * aspect * 1.8 : paddedWidth;
  const viewWidth = boxAspect > aspect ? flatLayoutWidth : paddedHeight * aspect;
  const viewHeight = boxAspect > aspect ? viewWidth / aspect : paddedHeight;
  return { viewWidth, viewHeight, aspect };
}
