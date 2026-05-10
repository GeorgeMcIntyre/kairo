import { geometryById, nodesById, sourcePathForNode } from "@kairo/core";
import type { DrawingEntity, Geometry, SceneNode, ScenePackage } from "@kairo/schema";
import { validateScenePackage } from "@kairo/validator";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { loadPublicScenePackage, resolveViewerSceneRequest, sampleScenePackage } from "./sceneLoader";
import { computeLayerEntityCounts, computeSceneStats, type LayerEntityCount } from "./sceneStats";
import {
  collectTextItems,
  SceneTextOverlay,
  type LabelDensityMode,
  type TextOverlayCamera,
  type TextOverlayMetrics
} from "./SceneTextOverlay";

const DEV_MODE = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

type RenderRecord = {
  object: THREE.Object3D;
  nodeId: string;
  layerId?: string;
  baseColor: THREE.Color;
  material: THREE.Material | THREE.Material[];
};

type ViewMode = "top2d" | "perspective";
type FitTarget = "scene" | "selected";

type FitRequest = {
  target: FitTarget;
  serial: number;
};

const selectedColor = new THREE.Color("#ffb020");
const matrixFromArray = (values: number[]) => new THREE.Matrix4().fromArray(values);

function layerColor(scenePackage: ScenePackage, layerId?: string): THREE.Color {
  const layer = scenePackage.layers.layers.find((entry) => entry.id === layerId);
  if (!layer?.color) {
    return new THREE.Color("#7f8b94");
  }
  return new THREE.Color(layer.color.r, layer.color.g, layer.color.b);
}

function visibleDrawingColor(color: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  if (hsl.l > 0.58 || hsl.s < 0.18) {
    return color.clone().lerp(new THREE.Color("#12324a"), 0.5);
  }
  return color.clone();
}

function materialColorFromEntity(scenePackage: ScenePackage, entity: DrawingEntity, fallbackLayerId?: string): THREE.Color {
  if (entity.color) {
    return visibleDrawingColor(new THREE.Color(entity.color.r, entity.color.g, entity.color.b));
  }
  return visibleDrawingColor(layerColor(scenePackage, entity.layerId ?? fallbackLayerId));
}

function TreeNode({
  node,
  depth,
  selectedNodeId,
  nodeMap,
  onSelect
}: {
  node: SceneNode;
  depth: number;
  selectedNodeId: string;
  nodeMap: Map<string, SceneNode>;
  onSelect: (nodeId: string) => void;
}) {
  return (
    <>
      <button
        className={node.id === selectedNodeId ? "tree-row selected" : "tree-row"}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => onSelect(node.id)}
        type="button"
      >
        <span className="node-type">{node.type}</span>
        <span>{node.displayName}</span>
      </button>
      {node.children.map((childId) => {
        const child = nodeMap.get(childId);
        return child ? (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedNodeId={selectedNodeId}
            nodeMap={nodeMap}
            onSelect={onSelect}
          />
        ) : null;
      })}
    </>
  );
}

function makeMesh(scenePackage: ScenePackage, geometry: Extract<Geometry, { kind: "mesh" }>) {
  const bufferGeometry = new THREE.BufferGeometry();
  bufferGeometry.setAttribute("position", new THREE.Float32BufferAttribute(geometry.vertices, 3));
  bufferGeometry.setIndex(geometry.indices);
  bufferGeometry.computeVertexNormals();

  const materialColor = scenePackage.materials.materials.find((material) => material.id === geometry.materialId)?.baseColor;
  const material = new THREE.MeshStandardMaterial({
    color: materialColor
      ? new THREE.Color(materialColor.r, materialColor.g, materialColor.b)
      : layerColor(scenePackage, geometry.layerId),
    metalness: 0.15,
    roughness: 0.55
  });

  const mesh = new THREE.Mesh(bufferGeometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function pointsForCircle(entity: Extract<DrawingEntity, { type: "circle" }>) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 32; i += 1) {
    const angle = (i / 32) * Math.PI * 2;
    points.push(
      new THREE.Vector3(
        entity.center[0] + Math.cos(angle) * entity.radius,
        entity.center[1] + Math.sin(angle) * entity.radius,
        entity.center[2]
      )
    );
  }
  return points;
}

function pointsForArc(entity: Extract<DrawingEntity, { type: "arc" }>) {
  const points: THREE.Vector3[] = [];
  const start = THREE.MathUtils.degToRad(entity.startAngleDeg);
  const end = THREE.MathUtils.degToRad(entity.endAngleDeg);
  for (let i = 0; i <= 24; i += 1) {
    const angle = start + ((end - start) * i) / 24;
    points.push(
      new THREE.Vector3(
        entity.center[0] + Math.cos(angle) * entity.radius,
        entity.center[1] + Math.sin(angle) * entity.radius,
        entity.center[2]
      )
    );
  }
  return points;
}

function pointsForEntity(entity: DrawingEntity): THREE.Vector3[] {
  if (entity.type === "line") {
    return [new THREE.Vector3(...entity.start), new THREE.Vector3(...entity.end)];
  }

  if (entity.type === "polyline") {
    const points = entity.points.map((point) => new THREE.Vector3(...point));
    return entity.closed ? [...points, points[0].clone()] : points;
  }

  if (entity.type === "circle") {
    return pointsForCircle(entity);
  }

  if (entity.type === "arc") {
    return pointsForArc(entity);
  }

  // text entities are rendered by SceneTextOverlay, not as line segments
  return [];
}

function makeCurveSet(scenePackage: ScenePackage, geometry: Extract<Geometry, { kind: "curve-set" }>, layerId?: string) {
  const positions: number[] = [];
  for (const entity of geometry.entities) {
    const points = pointsForEntity(entity);
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
  }
  const bufferGeometry = new THREE.BufferGeometry();
  bufferGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const color = visibleDrawingColor(layerColor(scenePackage, layerId ?? geometry.layerId));
  const material = new THREE.LineBasicMaterial({ color, depthTest: false });
  const lineSegments = new THREE.LineSegments(bufferGeometry, material);
  lineSegments.renderOrder = 2;
  return lineSegments;
}

function applyHighlight(records: RenderRecord[], selectedNodeId: string) {
  for (const record of records) {
    const selected = record.nodeId === selectedNodeId;
    const color = selected ? selectedColor : record.baseColor;
    record.object.renderOrder = selected ? 20 : 1;
    const materials = Array.isArray(record.material) ? record.material : [record.material];
    for (const material of materials) {
      if ("color" in material && material.color instanceof THREE.Color) {
        material.color.copy(color);
      }
    }
  }
}


function boundsForRecords(records: RenderRecord[], options?: { selectedNodeId?: string; hiddenLayerIds?: Set<string> }) {
  const bounds = new THREE.Box3();
  for (const record of records) {
    if (options?.selectedNodeId && record.nodeId !== options.selectedNodeId) {
      continue;
    }
    if (record.layerId && options?.hiddenLayerIds?.has(record.layerId)) {
      continue;
    }
    record.object.updateMatrixWorld(true);
    bounds.expandByObject(record.object);
  }
  return bounds;
}

function fitCameraToBounds(
  camera: THREE.OrthographicCamera | THREE.PerspectiveCamera,
  controls: OrbitControls,
  bounds: THREE.Box3,
  host: HTMLElement
) {
  if (bounds.isEmpty()) {
    return;
  }

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 1);
  const padding = 1.18;

  if (camera instanceof THREE.OrthographicCamera) {
    const aspect = Math.max(host.clientWidth / Math.max(host.clientHeight, 1), 0.1);
    const paddedWidth = Math.max(size.x, maxDimension * 0.04, 1) * padding;
    const paddedHeight = Math.max(size.y, maxDimension * 0.04, 1) * padding;
    const boxAspect = paddedWidth / paddedHeight;
    const flatLayoutWidth = boxAspect > 6 ? paddedHeight * aspect * 1.8 : paddedWidth;
    const viewWidth = boxAspect > aspect ? flatLayoutWidth : paddedHeight * aspect;
    const viewHeight = boxAspect > aspect ? viewWidth / aspect : paddedHeight;
    camera.left = -viewWidth / 2;
    camera.right = viewWidth / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.near = 0.1;
    camera.far = maxDimension * 20;
    camera.position.set(center.x, center.y, center.z + maxDimension * 2);
    camera.up.set(0, 1, 0);
  } else {
    const distance = maxDimension * 1.45;
    camera.near = Math.max(maxDimension / 100000, 0.1);
    camera.far = maxDimension * 20;
    camera.position.set(center.x + distance * 0.7, center.y - distance * 1.05, center.z + distance * 0.7);
  }

  camera.lookAt(center);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

function Viewport({
  scenePackage,
  viewMode,
  hiddenLayerIds,
  fitRequest,
  selectedNodeId,
  onSelect,
  labelDensity,
  readableOrientation
}: {
  scenePackage: ScenePackage;
  viewMode: ViewMode;
  hiddenLayerIds: Set<string>;
  fitRequest: FitRequest;
  selectedNodeId: string;
  onSelect: (nodeId: string) => void;
  labelDensity: LabelDensityMode;
  readableOrientation: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const recordsRef = useRef<RenderRecord[]>([]);
  const cameraRef = useRef<THREE.OrthographicCamera | THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneBoundsRef = useRef<THREE.Box3>(new THREE.Box3());
  const [overlayCamera, setOverlayCamera] = useState<TextOverlayCamera | null>(null);
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);
  const [rafTick, setRafTick] = useState(0);
  const [overlayMetrics, setOverlayMetrics] = useState<TextOverlayMetrics | null>(null);
  const textItems = useMemo(() => collectTextItems(scenePackage), [scenePackage]);

  // Latest-ref pattern: read current values in effects without adding them as deps.
  const hiddenLayerIdsRef = useRef(hiddenLayerIds);
  hiddenLayerIdsRef.current = hiddenLayerIds;
  const selectedNodeIdRef = useRef(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Build effect: full Three.js setup. Runs only when scene data or camera type changes.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f6f8fa");

    const camera =
      viewMode === "top2d"
        ? new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 10000)
        : new THREE.PerspectiveCamera(45, host.clientWidth / host.clientHeight, 0.1, 2000);
    camera.position.set(115, -135, 95);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.screenSpacePanning = true;
    controls.enableRotate = viewMode !== "top2d";
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 1.1;
    if (viewMode === "top2d") {
      controls.mouseButtons.LEFT = null;
      controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
      controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    }
    controlsRef.current = controls;

    setOverlayCamera(camera);
    setOverlayHost(host);
    const onCameraChange = () => setRafTick((tick) => tick + 1);
    controls.addEventListener("change", onCameraChange);

    const ambient = new THREE.AmbientLight("#ffffff", 1.7);
    const key = new THREE.DirectionalLight("#ffffff", 2);
    key.position.set(90, -70, 130);
    scene.add(ambient, key);

    const grid = new THREE.GridHelper(160, 16, "#c8d1d8", "#e1e6ea");
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);

    const nodeMap = nodesById(scenePackage);
    const geometryMap = geometryById(scenePackage);
    const records: RenderRecord[] = [];

    for (const node of scenePackage.scene.nodes) {
      for (const geometryRef of node.geometryRefs ?? []) {
        const geometry = geometryMap.get(geometryRef);
        if (!geometry) {
          continue;
        }

        const effectiveLayerId = node.layerId ?? geometry.layerId;
        const object = geometry.kind === "mesh" ? makeMesh(scenePackage, geometry) : makeCurveSet(scenePackage, geometry, effectiveLayerId);
        object.name = node.displayName;
        object.userData.nodeId = node.id;
        object.userData.layerId = effectiveLayerId;
        object.visible = !effectiveLayerId || !hiddenLayerIdsRef.current.has(effectiveLayerId);
        object.applyMatrix4(matrixFromArray(node.localTransform));
        scene.add(object);

        const material =
          geometry.kind === "mesh"
            ? (object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material
            : (object as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>).material;

        records.push({
          object,
          nodeId: node.id,
          layerId: effectiveLayerId,
          baseColor: visibleDrawingColor(layerColor(scenePackage, effectiveLayerId)),
          material
        });
      }
    }

    recordsRef.current = records;
    applyHighlight(records, selectedNodeIdRef.current);

    const sceneBounds = boundsForRecords(records, { hiddenLayerIds: hiddenLayerIdsRef.current });
    sceneBoundsRef.current = sceneBounds;
    fitCameraToBounds(camera, controls, sceneBounds, host);

    if (!sceneBounds.isEmpty()) {
      const center = sceneBounds.getCenter(new THREE.Vector3());
      const size = sceneBounds.getSize(new THREE.Vector3());
      const maxDimension = Math.max(size.x, size.y, size.z, 1);
      grid.position.copy(center);
      grid.scale.setScalar(Math.max(maxDimension / 160, 1));
    }

    const raycaster = new THREE.Raycaster();
    raycaster.params.Line.threshold = 4;
    const pointer = new THREE.Vector2();

    const onPointerDown = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const intersections = raycaster.intersectObjects(
        records.flatMap((record) => [record.object, ...record.object.children]),
        true
      );
      const hit = intersections.find((intersection) => {
        let current: THREE.Object3D | null = intersection.object;
        while (current) {
          if (current.userData.nodeId && nodeMap.has(current.userData.nodeId)) {
            return true;
          }
          current = current.parent;
        }
        return false;
      });

      if (hit) {
        let current: THREE.Object3D | null = hit.object;
        while (current && !current.userData.nodeId) {
          current = current.parent;
        }
        if (current?.userData.nodeId) {
          onSelectRef.current(current.userData.nodeId);
        }
      }
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const resize = () => {
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = host.clientWidth / host.clientHeight;
      }
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
      setRafTick((tick) => tick + 1);
    };
    window.addEventListener("resize", resize);

    setRafTick((tick) => tick + 1);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      controls.removeEventListener("change", onCameraChange);
      for (const record of records) {
        record.object.traverse((child) => {
          if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
            child.geometry?.dispose();
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const mat of mats) mat?.dispose();
          }
        });
      }
      host.removeChild(renderer.domElement);
      controls.dispose();
      renderer.dispose();
      cameraRef.current = null;
      controlsRef.current = null;
      setOverlayCamera(null);
      setOverlayHost(null);
    };
  }, [scenePackage, viewMode]); // hiddenLayerIds/onSelect read via refs; fit handled by separate effect

  // Layer visibility: toggle without rebuilding geometry.
  useEffect(() => {
    for (const record of recordsRef.current) {
      record.object.visible = !record.layerId || !hiddenLayerIds.has(record.layerId);
    }
  }, [hiddenLayerIds]);

  // Fit: reposition camera without rebuilding geometry.
  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const host = hostRef.current;
    if (!camera || !controls || !host) {
      return;
    }
    const bounds =
      fitRequest.target === "selected"
        ? boundsForRecords(recordsRef.current, {
            hiddenLayerIds: hiddenLayerIdsRef.current,
            selectedNodeId: selectedNodeIdRef.current
          })
        : sceneBoundsRef.current;
    fitCameraToBounds(camera, controls, bounds.isEmpty() ? sceneBoundsRef.current : bounds, host);
    setRafTick((tick) => tick + 1);
  }, [fitRequest]); // hiddenLayerIds/selectedNodeId read via refs

  // Selection highlight: update material colors without rebuilding geometry.
  useEffect(() => {
    applyHighlight(recordsRef.current, selectedNodeId);
  }, [selectedNodeId]);

  return (
    <div className="viewport" ref={hostRef}>
      <SceneTextOverlay
        items={textItems}
        camera={overlayCamera}
        host={overlayHost}
        hiddenLayerIds={hiddenLayerIds}
        rafTick={rafTick}
        densityMode={labelDensity}
        readableOrientation={readableOrientation}
        onMetrics={DEV_MODE ? setOverlayMetrics : undefined}
      />
      {DEV_MODE && overlayMetrics ? (
        <div className="text-overlay-diagnostics">
          <strong>Text overlay (dev)</strong>
          <span>items={overlayMetrics.itemCount}</span>
          <span>dom={overlayMetrics.domLabelCount}</span>
          <span>visible={overlayMetrics.visibleCount}</span>
          <span>clampedUp={overlayMetrics.clampedUpCount}</span>
          <span>frustumCulled={overlayMetrics.frustumCulledCount}</span>
          <span>densityHidden={overlayMetrics.densityHiddenCount}</span>
          <span>layerHidden={overlayMetrics.layerHiddenCount}</span>
          <span>pxPerUnit={overlayMetrics.pxPerUnit.toFixed(4)}</span>
          <span>mode={overlayMetrics.densityMode}</span>
          <span>camera={overlayMetrics.cameraReady ? "yes" : "no"}</span>
          <span>host={overlayMetrics.hostReady ? "yes" : "no"}</span>
        </div>
      ) : null}
    </div>
  );
}

function LayerPanel({
  layers,
  selectedLayerId,
  hiddenLayerIds,
  onToggleLayer,
  onShowAllLayers
}: {
  layers: LayerEntityCount[];
  selectedLayerId?: string;
  hiddenLayerIds: Set<string>;
  onToggleLayer: (layerId: string) => void;
  onShowAllLayers: () => void;
}) {
  return (
    <div className="layer-panel">
      <div className="section-heading">
        <h2>Layers</h2>
        <button type="button" onClick={onShowAllLayers}>
          Show all
        </button>
      </div>
      <div className="layer-list">
        {layers.map((layer) => (
          <label className={layer.id === selectedLayerId ? "layer-row selected" : "layer-row"} key={layer.id}>
            <input
              checked={!hiddenLayerIds.has(layer.id)}
              onChange={() => onToggleLayer(layer.id)}
              type="checkbox"
            />
            <span>{layer.name}</span>
            <strong>{layer.entityCount}</strong>
          </label>
        ))}
      </div>
    </div>
  );
}

export function App() {
  const [scenePackage, setScenePackage] = useState<ScenePackage>(sampleScenePackage);
  const [sceneStatus, setSceneStatus] = useState("Bundled sample scene");
  const [sceneLoadError, setSceneLoadError] = useState<string | undefined>();
  const [viewMode, setViewMode] = useState<ViewMode>("perspective");
  const [fitRequest, setFitRequest] = useState<FitRequest>({ target: "scene", serial: 0 });
  const [hiddenLayerIds, setHiddenLayerIds] = useState<Set<string>>(() => new Set());
  const nodeMap = useMemo(() => nodesById(scenePackage), [scenePackage]);
  const [selectedNodeId, setSelectedNodeId] = useState(scenePackage.scene.rootNodeId);
  const [labelDensity, setLabelDensity] = useState<LabelDensityMode>("auto");
  const [readableOrientation, setReadableOrientation] = useState(true);
  const selectedNode = nodeMap.get(selectedNodeId) ?? scenePackage.scene.nodes[0];
  const report = useMemo(() => validateScenePackage(scenePackage), [scenePackage]);
  const sceneStats = useMemo(() => computeSceneStats(scenePackage), [scenePackage]);
  const layerStats = useMemo(
    () =>
      computeLayerEntityCounts(scenePackage).sort((left, right) => {
        const rightTotal = right.entityCount + right.geometryCount;
        const leftTotal = left.entityCount + left.geometryCount;
        return rightTotal - leftTotal || left.name.localeCompare(right.name);
      }),
    [scenePackage]
  );
  const rootNode = nodeMap.get(scenePackage.scene.rootNodeId)!;
  const sourcePath = sourcePathForNode(scenePackage, selectedNode);
  const selectedLayerId = selectedNode.layerId;

  const requestFit = (target: FitTarget) => {
    setFitRequest((current) => ({ target, serial: current.serial + 1 }));
  };

  const toggleLayer = (layerId: string) => {
    setHiddenLayerIds((current) => {
      const next = new Set(current);
      if (next.has(layerId)) {
        next.delete(layerId);
      } else {
        next.add(layerId);
      }
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    try {
      const request = resolveViewerSceneRequest(window.location.search);
      if (request.kind === "bundled") {
        return;
      }

      setSceneStatus(`Loading ${request.sceneName}`);
      loadPublicScenePackage(request.basePath)
        .then((loadedScenePackage) => {
          if (!cancelled) {
            setScenePackage(loadedScenePackage);
            setSelectedNodeId(loadedScenePackage.scene.rootNodeId);
            setHiddenLayerIds(new Set());
            setViewMode(loadedScenePackage.manifest.axisSystem.up === "Z" ? "top2d" : "perspective");
            setFitRequest((current) => ({ target: "scene", serial: current.serial + 1 }));
            setSceneStatus(`Loaded ${request.sceneName}`);
            setSceneLoadError(undefined);
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setSceneStatus("Bundled sample scene");
            setSceneLoadError(error instanceof Error ? error.message : String(error));
          }
        });
    } catch (error) {
      setSceneLoadError(error instanceof Error ? error.message : String(error));
    }

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="app-shell">
      <aside className="tree-panel">
        <div className="panel-heading">
          <span>Scene Tree</span>
          <strong>{scenePackage.scene.nodes.length}</strong>
        </div>
        <TreeNode
          node={rootNode}
          depth={0}
          selectedNodeId={selectedNodeId}
          nodeMap={nodeMap}
          onSelect={setSelectedNodeId}
        />
      </aside>

      <section className="viewport-panel">
        <div className="viewport-toolbar">
          <span>{scenePackage.manifest.format}</span>
          <span>{scenePackage.manifest.units}</span>
          <span>{scenePackage.manifest.axisSystem.up}-up</span>
          <span>{sceneStatus}</span>
          <div className="toolbar-actions">
            <button
              className={viewMode === "top2d" ? "active" : ""}
              onClick={() => setViewMode("top2d")}
              type="button"
            >
              Top 2D
            </button>
            <button
              className={viewMode === "perspective" ? "active" : ""}
              onClick={() => setViewMode("perspective")}
              type="button"
            >
              3D
            </button>
            <button onClick={() => requestFit("scene")} type="button">
              Fit scene
            </button>
            <button onClick={() => requestFit("selected")} type="button">
              Fit selected
            </button>
            <span className="toolbar-divider" aria-hidden="true" />
            <span className="toolbar-label">Labels</span>
            <button
              className={labelDensity === "auto" ? "active" : ""}
              onClick={() => setLabelDensity("auto")}
              title="Hide labels smaller than ~5px (cleaner fit-scene view)"
              type="button"
            >
              Auto
            </button>
            <button
              className={labelDensity === "all" ? "active" : ""}
              onClick={() => setLabelDensity("all")}
              title="Show every label, clamping tiny labels up to 2px"
              type="button"
            >
              All
            </button>
            <button
              className={labelDensity === "off" ? "active" : ""}
              onClick={() => setLabelDensity("off")}
              title="Hide all text labels"
              type="button"
            >
              Off
            </button>
            <button
              className={readableOrientation ? "active" : ""}
              onClick={() => setReadableOrientation((current) => !current)}
              title="Flip upside-down labels so they read left-to-right"
              type="button"
            >
              Readable
            </button>
          </div>
        </div>
        <Viewport
          fitRequest={fitRequest}
          hiddenLayerIds={hiddenLayerIds}
          scenePackage={scenePackage}
          selectedNodeId={selectedNodeId}
          viewMode={viewMode}
          onSelect={setSelectedNodeId}
          labelDensity={labelDensity}
          readableOrientation={readableOrientation}
        />
      </section>

      <aside className="properties-panel">
        <div className="panel-heading">
          <span>Properties</span>
          <strong>{selectedNode.type}</strong>
        </div>
        <dl>
          <dt>Name</dt>
          <dd>{selectedNode.displayName}</dd>
          <dt>ID</dt>
          <dd>{selectedNode.id}</dd>
          <dt>Layer</dt>
          <dd>{selectedNode.layerId ?? "None"}</dd>
          <dt>Geometry</dt>
          <dd>{selectedNode.geometryRefs?.join(", ") ?? "None"}</dd>
          <dt>Source Path</dt>
          <dd>{sourcePath ?? "None"}</dd>
        </dl>
        <div className="metadata">
          <h2>Metadata</h2>
          {Object.entries(selectedNode.metadata ?? {}).map(([key, value]) => (
            <div className="metadata-row" key={key}>
              <span>{key}</span>
              <strong>{String(value)}</strong>
            </div>
          ))}
        </div>
        <LayerPanel
          hiddenLayerIds={hiddenLayerIds}
          layers={layerStats}
          selectedLayerId={selectedLayerId}
          onShowAllLayers={() => setHiddenLayerIds(new Set())}
          onToggleLayer={toggleLayer}
        />
      </aside>

      <section className={report.valid ? "diagnostics valid" : "diagnostics invalid"}>
        <div>
          <strong>{report.valid ? "Validation passed" : "Validation failed"}</strong>
          <span>
            {report.summary.errors} errors, {report.summary.warnings} warnings
          </span>
          <span>
            {sceneStats.nodeCount} nodes, {sceneStats.layerCount} layers, {sceneStats.geometryDocumentCount} geometry docs,{" "}
            {sceneStats.curveEntityCount} curve entities
          </span>
        </div>
        <ol>
          {report.findings.length === 0 ? (
            <li>{sceneLoadError ? `Scene load warning: ${sceneLoadError}` : "No validation findings for the loaded scene."}</li>
          ) : (
            report.findings.map((finding) => (
              <li key={`${finding.code}-${finding.path}`}>
                <strong>{finding.severity}</strong> {finding.code}: {finding.message}
              </li>
            ))
          )}
        </ol>
      </section>
    </main>
  );
}
