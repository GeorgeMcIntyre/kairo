import {
  computeEntityCentroid,
  computeRobustSceneBounds,
  createJobSessionForScenePackage,
  flattenCurveEntities,
  geometryById,
  layoutLocalToWorld,
  nodesById,
  parseSourceRef,
  sourceEntryForNode,
  updateCoordinateReadout,
  type Bounds3,
  type CoordinateReadout,
  type KairoJobSession,
  type LayoutPoint,
  type RobustSceneBounds
} from "@kairo/core";
import type { DrawingEntity, Geometry, SceneNode, ScenePackage } from "@kairo/schema";
import { validateScenePackage } from "@kairo/validator";
import type { DxfImportTimingStage } from "@kairo/importer-dxf/browser";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import viewerPackage from "../package.json";
import { createCurveBatchData, pickEntryForIntersectionIndex, type CurveSegmentPickEntry, type PickableCurveEntity } from "./curveBatch";
import {
  isPublicSceneAssetLoadError,
  loadLocalSceneFilePackage,
  loadPublicScenePackage,
  resolveViewerSceneRequest,
  sampleScenePackage
} from "./sceneLoader";
import { computeLayerEntityCounts, computeSceneStats, type LayerEntityCount } from "./sceneStats";
import {
  buildAdvancedLayoutModel,
  exportAdvancedLayoutCsv,
  exportAdvancedLayoutJson,
  exportAdvancedLayoutMarkdown
} from "./advancedEngineering/advancedLayout";
import {
  buildLayoutPackage,
  exportLayoutPackageCsv,
  exportLayoutPackageJson,
  exportLayoutPackageMarkdown
} from "./layoutLibrary/layoutPackage";
import {
  buildReviewedLayoutLibrary,
  exportReviewedLayoutLibraryCsv,
  exportReviewedLayoutLibraryJson,
  exportReviewedLayoutLibraryMarkdown
} from "./layoutLibrary/reviewedLayoutLibrary";
import {
  buildBlankLayoutReviewPack,
  compareLayoutPackageToTrainingTruth,
  exportLayoutReviewPackJson,
  exportReviewedTrainingSummaryMarkdown,
  exportReviewedTrainingTruthCsv,
  exportReviewedTrainingTruthJson,
  exportTrainingTruthComparisonCsv,
  exportTrainingTruthComparisonJson,
  exportTrainingTruthComparisonMarkdown,
  mergeReviewedTrainingTruth,
  parseLayoutReviewPackJson,
  parseReviewedTrainingTruthJson,
  type LayoutReviewPack,
  type ReviewedTrainingTruthPackage
} from "./layoutLibrary/layoutReviewPack";
import { DEVICE_KINDS, type DeviceKind } from "./semantic/deviceDictionary";
import { computeLayoutSemantics, type LayoutSemantics } from "./semantic/layoutSemantics";
import { SemanticOverlay } from "./semantic/SemanticOverlay";
import {
  DEFAULT_SEMANTIC_VALIDATION_FILTERS,
  buildSemanticOverlayModel,
  computeOutlierSummary,
  filterSemanticValidation,
  resolveSemanticSelection,
  type SemanticSelection,
  type SemanticOverlayModel,
  type SemanticValidationFilters
} from "./semantic/semanticValidation";
import {
  applySemanticDeviceOverrides,
  buildSemanticSummary,
  exportSemanticSummaryJson,
  exportSemanticSummaryMarkdown,
  type SemanticDeviceOverride,
  type SemanticOverrideMap
} from "./semantic/semanticSummary";
import {
  buildSemanticQaReport,
  exportSemanticQaReportJson,
  exportSemanticQaReportMarkdown
} from "./semantic/semanticQaReport";
import {
  collectTextItems,
  SceneTextOverlay,
  type LabelDensityMode,
  type TextOverlayCamera,
  type TextOverlayMetrics
} from "./SceneTextOverlay";
import { safeDisplayText } from "./textSafety";
import {
  computeOrthographicFitView,
  pointerClientToNdc,
  rendererViewportFromElement,
  type ViewportSize
} from "./viewerMath";

const DEV_MODE = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
const DEMO_SCENE_NAME = "scott-dxf2013-import";
const APP_VERSION = viewerPackage.version;

const EMPTY_LAYOUT_SEMANTICS: LayoutSemantics = {
  textEntities: [],
  mergedTextLabels: [],
  geometryGroups: [],
  stations: [],
  devices: [],
  unknownTextEntities: []
};

type RenderRecord = {
  object: THREE.Object3D;
  nodeId: string;
  layerId?: string;
  baseColor: THREE.Color;
  material: THREE.Material | THREE.Material[];
};

type ViewerSelection = {
  nodeId: string;
  entity?: PickableCurveEntity;
};

type ViewMode = "top2d" | "perspective";
type FitTarget = "scene" | "main" | "selected" | "raw";
type AdvancedLayoutExportFormat = "json" | "csv" | "markdown";

type FitRequest = {
  target: FitTarget;
  serial: number;
};

type ViewportDiagnostics = {
  devicePixelRatio: number;
  containerWidth: number;
  containerHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  rendererPixelRatio: number;
  cameraZoom: number;
  fitBoundsWidth: number;
  fitBoundsHeight: number;
  browserZoomWarning: boolean;
  timing?: DxfImportTimingStage[];
};

const SEMANTIC_OVERLAY_LIMITS = {
  stationLimit: 40,
  deviceLimit: 80,
  unknownLabelLimit: 80
};

const EMPTY_SEMANTIC_OVERLAY_MODEL: SemanticOverlayModel = {
  stations: [],
  deviceCandidates: [],
  unknownLabels: [],
  associationLines: [],
  selectedSourceMarkers: []
};

const selectedColor = new THREE.Color("#ffb020");
const hoverColor = new THREE.Color("#7ec8e3");
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

function makeCurveSet(
  scenePackage: ScenePackage,
  geometry: Extract<Geometry, { kind: "curve-set" }>,
  layerId?: string,
  hiddenEntityIds?: ReadonlySet<string>
) {
  const batch = createCurveBatchData(geometry, layerId, { hiddenEntityIds });
  const bufferGeometry = new THREE.BufferGeometry();
  bufferGeometry.setAttribute("position", new THREE.Float32BufferAttribute(batch.positions, 3));
  const color = visibleDrawingColor(layerColor(scenePackage, layerId ?? geometry.layerId));
  const material = new THREE.LineBasicMaterial({ color, depthTest: false });
  const lineSegments = new THREE.LineSegments(bufferGeometry, material);
  lineSegments.userData.pickEntriesBySegment = batch.pickEntriesBySegment;
  lineSegments.renderOrder = 2;
  return lineSegments;
}

function applyHighlight(records: RenderRecord[], selectedNodeId: string, hoveredNodeId?: string) {
  for (const record of records) {
    const selected = record.nodeId === selectedNodeId;
    const hovered = !selected && record.nodeId === hoveredNodeId;
    const color = selected ? selectedColor : hovered ? hoverColor : record.baseColor;
    record.object.renderOrder = selected ? 20 : hovered ? 10 : 1;
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
  viewport: ViewportSize
) {
  if (bounds.isEmpty()) {
    return;
  }

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 1);
  const padding = 1.18;

  if (camera instanceof THREE.OrthographicCamera) {
    const { viewWidth, viewHeight } = computeOrthographicFitView(size, viewport, padding);
    camera.left = -viewWidth / 2;
    camera.right = viewWidth / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.zoom = 1;
    camera.near = 0.1;
    camera.far = maxDimension * 20;
    camera.position.set(center.x, center.y, center.z + maxDimension * 2);
    camera.up.set(0, 1, 0);
  } else {
    const distance = maxDimension * 1.45;
    camera.aspect = viewport.width / Math.max(viewport.height, 1);
    camera.near = Math.max(maxDimension / 100000, 0.1);
    camera.far = maxDimension * 20;
    camera.position.set(center.x + distance * 0.7, center.y - distance * 0.7, center.z + distance * 0.7);
  }

  camera.lookAt(center);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

function box3FromBounds(bounds: Bounds3 | null): THREE.Box3 {
  if (!bounds) return new THREE.Box3();
  return new THREE.Box3(
    new THREE.Vector3(bounds.min[0], bounds.min[1], bounds.min[2]),
    new THREE.Vector3(bounds.max[0], bounds.max[1], bounds.max[2])
  );
}

function formatVec3(value: readonly [number, number, number]) {
  return value.map((entry) => entry.toFixed(2)).join(", ");
}

function formatLayoutPoint(value: LayoutPoint | null | undefined) {
  if (!value) return "none";
  return `${value.x.toFixed(2)}, ${value.y.toFixed(2)}`;
}

function formatBounds(bounds: Bounds3 | null) {
  if (!bounds) return "none";
  return `min[${formatVec3(bounds.min)}] max[${formatVec3(bounds.max)}]`;
}

function boundsCenterPoint(bounds: Bounds3): LayoutPoint {
  return {
    x: (bounds.min[0] + bounds.max[0]) / 2,
    y: (bounds.min[1] + bounds.max[1]) / 2
  };
}

function nodeTransformPoint(node: SceneNode): LayoutPoint {
  return {
    x: node.localTransform[12] ?? 0,
    y: node.localTransform[13] ?? 0
  };
}

function findDrawingEntity(scenePackage: ScenePackage, entityId: string): DrawingEntity | undefined {
  for (const document of scenePackage.geometry) {
    for (const geometry of document.geometries) {
      if (geometry.kind !== "curve-set") continue;
      const entity = geometry.entities.find((entry) => entry.id === entityId);
      if (entity) return entity;
    }
  }
  return undefined;
}

function pointFromEntity(entity: DrawingEntity): LayoutPoint {
  const centroid = computeEntityCentroid(entity);
  return { x: centroid[0], y: centroid[1] };
}

function sameLayoutPoint(left: LayoutPoint | null, right: LayoutPoint | null) {
  if (!left || !right) return left === right;
  return Math.abs(left.x - right.x) < 0.5 && Math.abs(left.y - right.y) < 0.5;
}

function formatConfidence(value: number | undefined) {
  if (value === undefined) return "n/a";
  return value.toFixed(2);
}

function formatTimingMs(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
}

function deviceKindLabel(value: string) {
  return value.replace(/_/g, " ");
}

function compactIdList(values: readonly string[], limit = 8): string {
  if (values.length === 0) return "none";
  const visible = values.slice(0, limit).join(", ");
  return values.length > limit ? `${visible}, +${values.length - limit} more` : visible;
}

function showingFirstLabel(visible: number, total: number): string | undefined {
  return total > visible ? `showing first ${visible} of ${total}` : undefined;
}

function semanticStatusLabel(status: string, override?: SemanticDeviceOverride): string {
  if (override) return "OVERRIDDEN";
  return status.toUpperCase();
}

function semanticReasonPreview(reasons: readonly string[]): string {
  return reasons.find((reason) => reason.trim().length > 0) ?? "heuristic evidence";
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Viewport({
  scenePackage,
  robustBounds,
  hiddenOutlierEntityIds,
  viewMode,
  hiddenLayerIds,
  fitRequest,
  selectedNodeId,
  onSelect,
  labelDensity,
  readableOrientation,
  semanticOverlayEnabled,
  semanticOverlayModel,
  onSelectSemantic,
  onCursorLayoutPoint,
  onViewportDiagnostics
}: {
  scenePackage: ScenePackage;
  robustBounds: RobustSceneBounds;
  hiddenOutlierEntityIds: ReadonlySet<string>;
  viewMode: ViewMode;
  hiddenLayerIds: Set<string>;
  fitRequest: FitRequest;
  selectedNodeId: string;
  onSelect: (selection: ViewerSelection) => void;
  labelDensity: LabelDensityMode;
  readableOrientation: boolean;
  semanticOverlayEnabled: boolean;
  semanticOverlayModel: SemanticOverlayModel;
  onSelectSemantic: (selection: SemanticSelection) => void;
  onCursorLayoutPoint?: (point: LayoutPoint | null) => void;
  onViewportDiagnostics?: (diagnostics: ViewportDiagnostics) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const recordsRef = useRef<RenderRecord[]>([]);
  const cameraRef = useRef<THREE.OrthographicCamera | THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneBoundsRef = useRef<THREE.Box3>(new THREE.Box3());
  const mainBoundsRef = useRef<THREE.Box3>(new THREE.Box3());
  const lastFitBoundsRef = useRef<THREE.Box3>(new THREE.Box3());
  const viewportTimingRef = useRef<DxfImportTimingStage[]>([]);
  const hoveredNodeIdRef = useRef("");
  const [overlayCamera, setOverlayCamera] = useState<TextOverlayCamera | null>(null);
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);
  const [rafTick, setRafTick] = useState(0);
  const [overlayMetrics, setOverlayMetrics] = useState<TextOverlayMetrics | null>(null);
  const textItems = useMemo(() => collectTextItems(scenePackage), [scenePackage]);

  // Latest-ref pattern: read current values in effects without adding them as deps.
  const hiddenLayerIdsRef = useRef(hiddenLayerIds);
  hiddenLayerIdsRef.current = hiddenLayerIds;
  const hiddenOutlierEntityIdsRef = useRef(hiddenOutlierEntityIds);
  hiddenOutlierEntityIdsRef.current = hiddenOutlierEntityIds;
  const selectedNodeIdRef = useRef(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onCursorLayoutPointRef = useRef(onCursorLayoutPoint);
  onCursorLayoutPointRef.current = onCursorLayoutPoint;
  const onViewportDiagnosticsRef = useRef(onViewportDiagnostics);
  onViewportDiagnosticsRef.current = onViewportDiagnostics;

  const publishViewportDiagnostics = (bounds: THREE.Box3 = mainBoundsRef.current) => {
    const host = hostRef.current;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!host || !renderer || !camera) {
      return;
    }
    const viewport = rendererViewportFromElement(host, window.devicePixelRatio || 1);
    const fitSize = bounds.isEmpty() ? new THREE.Vector3() : bounds.getSize(new THREE.Vector3());
    onViewportDiagnosticsRef.current?.({
      devicePixelRatio: viewport.devicePixelRatio,
      containerWidth: viewport.width,
      containerHeight: viewport.height,
      canvasWidth: renderer.domElement.width,
      canvasHeight: renderer.domElement.height,
      rendererPixelRatio: renderer.getPixelRatio(),
      cameraZoom: camera instanceof THREE.OrthographicCamera ? camera.zoom : 1,
      fitBoundsWidth: fitSize.x,
      fitBoundsHeight: fitSize.y,
      browserZoomWarning: Math.abs(viewport.devicePixelRatio - 1) > 0.05,
      timing: viewportTimingRef.current
    });
  };

  // Build effect: full Three.js setup. Runs only when scene data or camera type changes.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const setupStartedAt = performance.now();
    let geometryBatchMs = 0;
    hoveredNodeIdRef.current = "";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#111927");
    const initialViewport = rendererViewportFromElement(host, window.devicePixelRatio || 1);

    const camera =
      viewMode === "top2d"
        ? new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 10000)
        : new THREE.PerspectiveCamera(45, initialViewport.width / initialViewport.height, 0.1, 2000);
    camera.position.set(115, -135, 95);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(initialViewport.rendererPixelRatio);
    renderer.setSize(initialViewport.width, initialViewport.height, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    rendererRef.current = renderer;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.screenSpacePanning = true;
    controls.enableRotate = viewMode !== "top2d";
    controls.zoomToCursor = true;
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
    const onCameraChange = () => {
      publishViewportDiagnostics(mainBoundsRef.current);
      setRafTick((tick) => tick + 1);
    };
    controls.addEventListener("change", onCameraChange);

    const ambient = new THREE.AmbientLight("#ffffff", 1.7);
    const key = new THREE.DirectionalLight("#ffffff", 2);
    key.position.set(90, -70, 130);
    scene.add(ambient, key);

    const grid = new THREE.GridHelper(160, 16, "#2a3e52", "#1a2d3e");
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
        const objectStartedAt = performance.now();
        const object =
          geometry.kind === "mesh"
            ? makeMesh(scenePackage, geometry)
            : makeCurveSet(scenePackage, geometry, effectiveLayerId, hiddenOutlierEntityIdsRef.current);
        if (geometry.kind === "curve-set") {
          geometryBatchMs += Math.max(0, performance.now() - objectStartedAt);
        }
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

    const sceneBounds = box3FromBounds(robustBounds.rawBounds);
    sceneBoundsRef.current = sceneBounds;

    const mainBounds = box3FromBounds(robustBounds.fitBounds);
    mainBoundsRef.current = mainBounds;

    const initialFitBounds = !mainBounds.isEmpty() ? mainBounds : sceneBounds;
    fitCameraToBounds(camera, controls, initialFitBounds, initialViewport);
    lastFitBoundsRef.current = initialFitBounds.clone();

    if (!mainBounds.isEmpty()) {
      const center = mainBounds.getCenter(new THREE.Vector3());
      const size = mainBounds.getSize(new THREE.Vector3());
      const maxDimension = Math.max(size.x, size.y, size.z, 1);
      grid.position.copy(center);
      grid.scale.setScalar(Math.max(maxDimension / 160, 1));
    }

    if (DEV_MODE) {
      // eslint-disable-next-line no-console
      console.info("[Kairo bounds]", {
        rawBounds: robustBounds.rawBounds,
        fitBounds: robustBounds.fitBounds,
        outlierBounds: robustBounds.outlierBounds,
        outlierCount: robustBounds.outlierEntityIds.length,
        topOutliers: robustBounds.topOutliers.map((entry) => ({
          entityId: entry.entityId,
          type: entry.type,
          layer: entry.layerId,
          bounds: entry.bounds,
          distanceFromMainCluster: Number(entry.distanceFromMainCluster.toFixed(2)),
          size: entry.size
        }))
      });
    }

    viewportTimingRef.current = [
      { stage: "geometry-batch-build", ms: geometryBatchMs },
      { stage: "scene-render-setup", ms: Math.max(0, performance.now() - setupStartedAt) }
    ];

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pickableObjects = records.map((record) => record.object);
    const cursorPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const cursorPoint = new THREE.Vector3();
    let lastCursorReadoutAt = 0;
    let lastCursorReadoutPoint: LayoutPoint | null = null;

    const setDynamicThreshold = () => {
      const pixelTolerance = 6;
      const canvasBounds = renderer.domElement.getBoundingClientRect();
      if (camera instanceof THREE.OrthographicCamera) {
        raycaster.params.Line.threshold =
          ((camera.right - camera.left) / Math.max(canvasBounds.width, 1)) * pixelTolerance;
      } else {
        const dist = camera.position.distanceTo(controls.target);
        raycaster.params.Line.threshold =
          ((dist * Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov / 2)) * 2) /
            Math.max(canvasBounds.height, 1)) *
          pixelTolerance;
      }
    };

    const resolveHitSelection = (intersections: THREE.Intersection[]): ViewerSelection | undefined => {
      const hit = intersections.find((intersection) => {
        let current: THREE.Object3D | null = intersection.object;
        while (current) {
          if (current.userData.nodeId && nodeMap.has(current.userData.nodeId)) return true;
          current = current.parent;
        }
        return false;
      });
      if (!hit) return undefined;
      let current: THREE.Object3D | null = hit.object;
      while (current && !current.userData.nodeId) current = current.parent;
      if (!current) return undefined;
      const nodeId = (current?.userData.nodeId as string) ?? "";
      if (!nodeId) return undefined;

      const pickEntriesBySegment = current.userData.pickEntriesBySegment;
      const entity =
        Array.isArray(pickEntriesBySegment)
          ? pickEntryForIntersectionIndex(hit.index, pickEntriesBySegment as CurveSegmentPickEntry[])
          : undefined;
      return { nodeId, entity };
    };

    const castRay = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      const ndc = pointerClientToNdc(event.clientX, event.clientY, bounds);
      pointer.set(ndc.x, ndc.y);
      setDynamicThreshold();
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(pickableObjects, true);
    };

    const publishCursorLayoutPoint = (point: LayoutPoint | null, force = false) => {
      const now = performance.now();
      const roundedPoint = point
        ? { x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 }
        : null;
      const movedEnough =
        !sameLayoutPoint(lastCursorReadoutPoint, roundedPoint) &&
        (!lastCursorReadoutPoint ||
          !roundedPoint ||
          Math.hypot(lastCursorReadoutPoint.x - roundedPoint.x, lastCursorReadoutPoint.y - roundedPoint.y) >= 25);
      if (!force && !movedEnough && now - lastCursorReadoutAt < 80) return;
      if (!force && sameLayoutPoint(lastCursorReadoutPoint, roundedPoint)) return;
      lastCursorReadoutAt = now;
      lastCursorReadoutPoint = roundedPoint;
      onCursorLayoutPointRef.current?.(roundedPoint);
    };

    const onPointerDown = (event: PointerEvent) => {
      const selection = resolveHitSelection(castRay(event));
      if (selection) {
        onSelectRef.current(selection);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const intersections = castRay(event);
      publishCursorLayoutPoint(
        raycaster.ray.intersectPlane(cursorPlane, cursorPoint) ? { x: cursorPoint.x, y: cursorPoint.y } : null
      );

      const nodeId = resolveHitSelection(intersections)?.nodeId ?? "";
      if (nodeId !== hoveredNodeIdRef.current) {
        hoveredNodeIdRef.current = nodeId;
        renderer.domElement.style.cursor = nodeId ? "pointer" : "default";
        applyHighlight(records, selectedNodeIdRef.current, hoveredNodeIdRef.current);
      }
    };

    const onPointerLeave = () => {
      publishCursorLayoutPoint(null, true);
      hoveredNodeIdRef.current = "";
      renderer.domElement.style.cursor = "default";
      applyHighlight(records, selectedNodeIdRef.current);
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);

    let frame = 0;
    let firstRenderPublished = false;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
      if (!firstRenderPublished) {
        firstRenderPublished = true;
        viewportTimingRef.current = [
          ...viewportTimingRef.current.filter((entry) => entry.stage !== "first-render-ready"),
          { stage: "first-render-ready", ms: Math.max(0, performance.now() - setupStartedAt) }
        ];
        publishViewportDiagnostics(mainBoundsRef.current);
      }
    };
    animate();

    const resize = () => {
      const viewport = rendererViewportFromElement(host, window.devicePixelRatio || 1);
      renderer.setPixelRatio(viewport.rendererPixelRatio);
      renderer.setSize(viewport.width, viewport.height, false);
      const resizeFitBounds = lastFitBoundsRef.current.isEmpty() ? mainBoundsRef.current : lastFitBoundsRef.current;
      if (!resizeFitBounds.isEmpty()) {
        fitCameraToBounds(camera, controls, resizeFitBounds, viewport);
      } else if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = viewport.width / viewport.height;
      }
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      publishViewportDiagnostics(resizeFitBounds);
      setRafTick((tick) => tick + 1);
    };
    let resizeObserver: ResizeObserver | undefined;
    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(() => resize());
      resizeObserver.observe(host);
    }
    window.addEventListener("resize", resize);

    resize();
    setRafTick((tick) => tick + 1);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
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
      rendererRef.current = null;
      setOverlayCamera(null);
      setOverlayHost(null);
    };
  }, [scenePackage, viewMode, robustBounds, hiddenOutlierEntityIds]); // hiddenLayerIds/onSelect read via refs; fit handled by separate effect

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
    const viewport = rendererViewportFromElement(host, window.devicePixelRatio || 1);
    const bounds =
      fitRequest.target === "selected"
        ? boundsForRecords(recordsRef.current, {
            hiddenLayerIds: hiddenLayerIdsRef.current,
            selectedNodeId: selectedNodeIdRef.current
          })
        : fitRequest.target === "raw"
        ? sceneBoundsRef.current
        : mainBoundsRef.current;
    const fitBounds = bounds.isEmpty() ? sceneBoundsRef.current : bounds;
    fitCameraToBounds(camera, controls, fitBounds, viewport);
    lastFitBoundsRef.current = fitBounds.clone();
    publishViewportDiagnostics(fitBounds);
    setRafTick((tick) => tick + 1);
  }, [fitRequest]); // hiddenLayerIds/selectedNodeId read via refs

  // Selection highlight: update material colors without rebuilding geometry.
  useEffect(() => {
    applyHighlight(recordsRef.current, selectedNodeId, hoveredNodeIdRef.current);
  }, [selectedNodeId]);

  return (
    <div className="viewport" ref={hostRef}>
      <SceneTextOverlay
        items={textItems}
        camera={overlayCamera}
        host={overlayHost}
        hiddenLayerIds={hiddenLayerIds}
        hiddenEntityIds={hiddenOutlierEntityIds}
        rafTick={rafTick}
        densityMode={labelDensity}
        readableOrientation={readableOrientation}
        onMetrics={DEV_MODE ? setOverlayMetrics : undefined}
      />
      <SemanticOverlay
        camera={overlayCamera}
        enabled={semanticOverlayEnabled}
        host={overlayHost}
        model={semanticOverlayModel}
        rafTick={rafTick}
        onSelect={onSelectSemantic}
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
  onShowAllLayers,
  onClose
}: {
  layers: LayerEntityCount[];
  selectedLayerId?: string;
  hiddenLayerIds: Set<string>;
  onToggleLayer: (layerId: string) => void;
  onShowAllLayers: () => void;
  onClose: () => void;
}) {
  return (
    <div className="layer-panel">
      <div className="section-heading">
        <h2>Layers</h2>
        <div className="panel-heading-actions">
          <button type="button" onClick={onShowAllLayers}>
            Show all
          </button>
          <button className="panel-hide-button" type="button" onClick={onClose}>
            Hide
          </button>
        </div>
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const reviewPackInputRef = useRef<HTMLInputElement | null>(null);
  const trainingTruthInputRef = useRef<HTMLInputElement | null>(null);
  const sceneLoadSerialRef = useRef(0);
  const [scenePackage, setScenePackage] = useState<ScenePackage>(sampleScenePackage);
  const [jobSession, setJobSession] = useState<KairoJobSession>(() => createJobSessionForScenePackage(sampleScenePackage));
  const [sceneStatus, setSceneStatus] = useState("Bundled sample scene");
  const [sceneLoadError, setSceneLoadError] = useState<string | undefined>();
  const [activeSceneName, setActiveSceneName] = useState<string | undefined>();
  const [viewMode, setViewMode] = useState<ViewMode>("top2d");
  const [fitRequest, setFitRequest] = useState<FitRequest>({ target: "main", serial: 0 });
  const [hiddenLayerIds, setHiddenLayerIds] = useState<Set<string>>(() => new Set());
  const nodeMap = useMemo(() => nodesById(scenePackage), [scenePackage]);
  const [selectedNodeId, setSelectedNodeId] = useState(scenePackage.scene.rootNodeId);
  const [selectedEntity, setSelectedEntity] = useState<PickableCurveEntity | undefined>();
  const [labelDensity, setLabelDensity] = useState<LabelDensityMode>("auto");
  const [readableOrientation, setReadableOrientation] = useState(true);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [layersPanelOpen, setLayersPanelOpen] = useState(true);
  const [semanticPanelOpen, setSemanticPanelOpen] = useState(false);
  const [inspectorPanelOpen, setInspectorPanelOpen] = useState(true);
  const [showOutliers, setShowOutliers] = useState(false);
  const [semanticOverlayEnabled, setSemanticOverlayEnabled] = useState(false);
  const [selectedSemantic, setSelectedSemantic] = useState<SemanticSelection | undefined>();
  const [semanticDeviceOverrides, setSemanticDeviceOverrides] = useState<SemanticOverrideMap>({});
  const [semanticFilters, setSemanticFilters] = useState<SemanticValidationFilters>({
    ...DEFAULT_SEMANTIC_VALIDATION_FILTERS
  });
  const [semanticCopyStatus, setSemanticCopyStatus] = useState<string | undefined>();
  const [importedLayoutReviewPack, setImportedLayoutReviewPack] = useState<LayoutReviewPack | undefined>();
  const [importedReviewedTrainingTruth, setImportedReviewedTrainingTruth] =
    useState<ReviewedTrainingTruthPackage | undefined>();
  const [layoutReviewStatus, setLayoutReviewStatus] = useState<string | undefined>();
  const [viewportDiagnostics, setViewportDiagnostics] = useState<ViewportDiagnostics | null>(null);
  const [sceneLoadTiming, setSceneLoadTiming] = useState<DxfImportTimingStage[]>([]);
  const [semanticAnalysisTiming, setSemanticAnalysisTiming] = useState<DxfImportTimingStage | undefined>();
  const [dxfDragActive, setDxfDragActive] = useState(false);
  const selectedNode = nodeMap.get(selectedNodeId) ?? scenePackage.scene.nodes[0];
  const activeLayout = useMemo(
    () => {
      const layout =
        jobSession.layoutMap.layouts.find((entry) => entry.layoutId === jobSession.layoutMap.activeLayoutId) ??
        jobSession.layoutMap.layouts[0];
      if (!layout) {
        throw new Error("Kairo job session must contain at least one layout.");
      }
      return layout;
    },
    [jobSession]
  );
  const coordinateReadout = jobSession.layoutMap.coordinateReadout;
  const report = useMemo(() => validateScenePackage(scenePackage), [scenePackage]);
  const sceneStats = useMemo(() => computeSceneStats(scenePackage), [scenePackage]);
  const robustBounds = useMemo(
    () => computeRobustSceneBounds(flattenCurveEntities(scenePackage.geometry)),
    [scenePackage]
  );
  const [detectedLayoutSemantics, setDetectedLayoutSemantics] =
    useState<LayoutSemantics>(EMPTY_LAYOUT_SEMANTICS);
  const [semanticAnalysisStatus, setSemanticAnalysisStatus] = useState<"pending" | "ready">("pending");

  useEffect(() => {
    let cancelled = false;
    setSemanticAnalysisStatus("pending");
    setSemanticAnalysisTiming(undefined);
    setDetectedLayoutSemantics(EMPTY_LAYOUT_SEMANTICS);

    const runAnalysis = () => {
      const startedAt = performance.now();
      const nextSemantics = computeLayoutSemantics(scenePackage, robustBounds);
      if (cancelled) return;
      const elapsedMs = Math.max(0, performance.now() - startedAt);
      setDetectedLayoutSemantics(nextSemantics);
      setSemanticAnalysisStatus("ready");
      setSemanticAnalysisTiming({ stage: "semantic-analysis", ms: elapsedMs });

      if (DEV_MODE) {
        // eslint-disable-next-line no-console
        console.info("[Kairo] semantic analysis", {
          ms: Math.round(elapsedMs),
          stations: nextSemantics.stations.length,
          devices: nextSemantics.devices.length,
          unknownTextEntities: nextSemantics.unknownTextEntities.length
        });
      }
    };

    const handle = globalThis.setTimeout(runAnalysis, 50);

    return () => {
      cancelled = true;
      globalThis.clearTimeout(handle);
    };
  }, [scenePackage, robustBounds]);

  const layoutSemantics = useMemo(
    () => applySemanticDeviceOverrides(detectedLayoutSemantics, semanticDeviceOverrides),
    [detectedLayoutSemantics, semanticDeviceOverrides]
  );
  const semanticDevicesById = useMemo(
    () => new Map(layoutSemantics.devices.map((device) => [device.id, device])),
    [layoutSemantics]
  );
  const semanticDeviceByEntityId = useMemo(() => {
    const result = new Map<string, (typeof layoutSemantics.devices)[number]>();
    for (const device of layoutSemantics.devices) {
      for (const entityId of device.linkedEntityIds) {
        if (!result.has(entityId)) result.set(entityId, device);
      }
      for (const textId of device.sourceTextEntityIds) {
        if (!result.has(textId)) result.set(textId, device);
      }
    }
    return result;
  }, [layoutSemantics]);
  const semanticValidation = useMemo(
    () => filterSemanticValidation(layoutSemantics, semanticFilters),
    [layoutSemantics, semanticFilters]
  );
  const semanticOverlayModel = useMemo(
    () =>
      semanticOverlayEnabled
        ? buildSemanticOverlayModel(layoutSemantics, semanticFilters, selectedSemantic, SEMANTIC_OVERLAY_LIMITS)
        : EMPTY_SEMANTIC_OVERLAY_MODEL,
    [layoutSemantics, semanticFilters, selectedSemantic, semanticOverlayEnabled]
  );
  const selectedSemanticDetails = useMemo(
    () => resolveSemanticSelection(layoutSemantics, selectedSemantic),
    [layoutSemantics, selectedSemantic]
  );
  const selectedLayoutPoint = useMemo((): LayoutPoint | null => {
    if (selectedEntity) {
      const entity = findDrawingEntity(scenePackage, selectedEntity.entityId);
      return entity ? pointFromEntity(entity) : null;
    }
    if (selectedSemanticDetails?.bounds) {
      return boundsCenterPoint(selectedSemanticDetails.bounds);
    }
    return selectedNode ? nodeTransformPoint(selectedNode) : null;
  }, [scenePackage, selectedEntity, selectedNode, selectedSemanticDetails]);
  const selectedWorldPoint = useMemo(
    () => (activeLayout && selectedLayoutPoint ? layoutLocalToWorld(selectedLayoutPoint, activeLayout) : null),
    [activeLayout, selectedLayoutPoint]
  );
  const semanticSummary = useMemo(
    () => buildSemanticSummary(layoutSemantics, scenePackage.manifest.source.path),
    [layoutSemantics, scenePackage.manifest.source.path]
  );
  const semanticQaReport = useMemo(
    () => buildSemanticQaReport(layoutSemantics, scenePackage.manifest.source.path),
    [layoutSemantics, scenePackage.manifest.source.path]
  );
  const advancedLayoutModel = useMemo(
    () => buildAdvancedLayoutModel(scenePackage, layoutSemantics),
    [scenePackage, layoutSemantics]
  );
  const layoutLibraryPackage = useMemo(
    () => buildLayoutPackage(scenePackage, layoutSemantics, advancedLayoutModel),
    [scenePackage, layoutSemantics, advancedLayoutModel]
  );
  const blankLayoutReviewPack = useMemo(
    () => buildBlankLayoutReviewPack(layoutLibraryPackage),
    [layoutLibraryPackage]
  );
  const reviewedTrainingTruth = useMemo(
    () => mergeReviewedTrainingTruth(layoutLibraryPackage, importedLayoutReviewPack ?? blankLayoutReviewPack),
    [layoutLibraryPackage, importedLayoutReviewPack, blankLayoutReviewPack]
  );
  const activeReviewedTrainingTruth = importedReviewedTrainingTruth ?? reviewedTrainingTruth;
  const reviewedLayoutLibrary = useMemo(
    () => buildReviewedLayoutLibrary(layoutLibraryPackage, activeReviewedTrainingTruth),
    [layoutLibraryPackage, activeReviewedTrainingTruth]
  );
  const trainingTruthComparison = useMemo(
    () => compareLayoutPackageToTrainingTruth(layoutLibraryPackage, activeReviewedTrainingTruth),
    [layoutLibraryPackage, activeReviewedTrainingTruth]
  );
  const outlierSummary = useMemo(() => computeOutlierSummary(robustBounds), [robustBounds]);
  const hiddenOutlierEntityIds = useMemo(
    () => (showOutliers ? new Set<string>() : new Set(robustBounds.outlierEntityIds)),
    [robustBounds, showOutliers]
  );
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
  const selectedLayerId = selectedEntity?.layerId ?? selectedNode.layerId;

  const selectedSourceRef = selectedEntity?.sourceRef ?? selectedNode.sourceRef;
  const sourceEntry = selectedEntity?.sourceRef
    ? scenePackage.sourceMap.sources.find((source) => source.id === selectedEntity.sourceRef)
    : sourceEntryForNode(scenePackage, selectedNode);
  const parsedRef = selectedSourceRef ? parseSourceRef(selectedSourceRef) : undefined;
  const selectedLayerName = scenePackage.layers.layers.find((l) => l.id === selectedLayerId)?.name;
  const selectedEntitySemanticDevice = selectedEntity ? semanticDeviceByEntityId.get(selectedEntity.entityId) : undefined;
  const selectedSemanticDevice =
    selectedSemantic?.kind === "device" ? semanticDevicesById.get(selectedSemantic.id) : undefined;
  const selectedSemanticOverride = selectedSemanticDevice ? semanticDeviceOverrides[selectedSemanticDevice.id] : undefined;
  const visibleSemanticStations = semanticValidation.stations.slice(0, 28);
  const visibleSemanticDevices = semanticValidation.devices.slice(0, 48);
  const visibleUnknownText = semanticValidation.unknownTextEntities.slice(0, 20);
  const stationListCount = showingFirstLabel(visibleSemanticStations.length, semanticValidation.stations.length);
  const deviceListCount = showingFirstLabel(visibleSemanticDevices.length, semanticValidation.devices.length);
  const unknownListCount = showingFirstLabel(visibleUnknownText.length, semanticValidation.unknownTextEntities.length);
  const sceneIsLoading = sceneStatus.startsWith("Loading ");
  const landingMode = !activeSceneName && !sceneLoadError;

  const updateJobCoordinateReadout = useCallback((patch: Partial<CoordinateReadout>) => {
    setJobSession((current) => updateCoordinateReadout(current, patch));
  }, []);

  const updateCursorLayoutPoint = useCallback(
    (point: LayoutPoint | null) => {
      const cursorWorld = activeLayout && point ? layoutLocalToWorld(point, activeLayout) : null;
      setJobSession((current) => {
        if (sameLayoutPoint(current.layoutMap.coordinateReadout.cursorWorld, cursorWorld)) {
          return current;
        }
        return updateCoordinateReadout(current, { cursorWorld });
      });
    },
    [activeLayout]
  );

  useEffect(() => {
    updateJobCoordinateReadout({
      selectedWorld: selectedWorldPoint,
      selectedLayoutOrigin: activeLayout ? { x: activeLayout.originX, y: activeLayout.originY } : null,
      activeLayoutId: activeLayout?.layoutId,
      selectedLayoutId: activeLayout?.layoutId
    });
  }, [activeLayout, selectedWorldPoint, updateJobCoordinateReadout]);

  const requestFit = (target: FitTarget) => {
    setFitRequest((current) => ({ target, serial: current.serial + 1 }));
  };

  const selectNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setSelectedEntity(undefined);
    setSelectedSemantic(undefined);
  };

  const selectViewport = (selection: ViewerSelection) => {
    setSelectedNodeId(selection.nodeId);
    setSelectedEntity(selection.entity);
    setSelectedSemantic(undefined);
  };

  const selectSemantic = (selection: SemanticSelection) => {
    setSelectedEntity(undefined);
    setSelectedSemantic(selection);
  };

  const updateSemanticFilters = (patch: Partial<SemanticValidationFilters>) => {
    setSemanticFilters((current) => ({ ...current, ...patch }));
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

  // TODO: Add React state transition coverage for overlapping scene loads.
  const startSceneLoad = useCallback(() => {
    sceneLoadSerialRef.current += 1;
    return sceneLoadSerialRef.current;
  }, []);

  const isCurrentSceneLoad = useCallback((serial: number) => sceneLoadSerialRef.current === serial, []);

  const activateScenePackage = useCallback(
    (
      loadedScenePackage: ScenePackage,
      options: {
        activeName: string;
        status: string;
        semanticOverlayEnabled?: boolean;
        semanticPanelOpen?: boolean;
        timing?: DxfImportTimingStage[];
      }
    ) => {
      setScenePackage(loadedScenePackage);
      setJobSession(createJobSessionForScenePackage(loadedScenePackage));
      setSelectedNodeId(loadedScenePackage.scene.rootNodeId);
      setSelectedEntity(undefined);
      setSelectedSemantic(undefined);
      setSemanticDeviceOverrides({});
      setSemanticFilters({ ...DEFAULT_SEMANTIC_VALIDATION_FILTERS });
      setHiddenLayerIds(new Set());
      setShowOutliers(false);
      setViewMode(loadedScenePackage.manifest.axisSystem.up === "Z" ? "top2d" : "perspective");
      setFitRequest((current) => ({ target: "main", serial: current.serial + 1 }));
      setSceneStatus(options.status);
      setSceneLoadError(undefined);
      setActiveSceneName(options.activeName);
      setSceneLoadTiming(options.timing ?? []);
      if (options.semanticOverlayEnabled !== undefined) {
        setSemanticOverlayEnabled(options.semanticOverlayEnabled);
      }
      if (options.semanticPanelOpen !== undefined) {
        setSemanticPanelOpen(options.semanticPanelOpen);
      }
    },
    []
  );

  const loadPublicScene = useCallback(async (sceneName: string, options?: { updateUrl?: boolean }) => {
    const loadSerial = startSceneLoad();
    setSceneStatus(`Loading ${sceneName}`);
    setSceneLoadError(undefined);
    setSceneLoadTiming([]);
    setActiveSceneName(sceneName);

    try {
      const loadedScenePackage = await loadPublicScenePackage(`/scenes/${sceneName}`);
      if (!isCurrentSceneLoad(loadSerial)) return;
      activateScenePackage(loadedScenePackage, {
        activeName: sceneName,
        status: `Loaded ${sceneName}`
      });

      if (options?.updateUrl) {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set("scene", sceneName);
        window.history.pushState(null, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
      }
    } catch (error) {
      if (!isCurrentSceneLoad(loadSerial)) return;
      setActiveSceneName(undefined);
      setSceneLoadTiming([]);
      if (isPublicSceneAssetLoadError(error)) {
        setSceneStatus("Open a local DXF / Kairo file");
        setSceneLoadError(undefined);
        return;
      }
      setSceneStatus("Demo layout failed to load");
      setSceneLoadError(
        error instanceof Error
          ? `Could not load ${sceneName}. ${error.message}`
          : `Could not load ${sceneName}. ${String(error)}`
      );
    }
  }, [activateScenePackage, isCurrentSceneLoad, startSceneLoad]);

  const loadLocalSceneFile = useCallback(
    async (file: File) => {
      const loadSerial = startSceneLoad();
      const fileName = file.name || "uploaded.kairo";
      setSceneStatus(`Loading ${fileName}`);
      setSceneLoadError(undefined);
      setSceneLoadTiming([]);
      setActiveSceneName(fileName);

      try {
        const result = await loadLocalSceneFilePackage(file);
        if (!isCurrentSceneLoad(loadSerial)) return;
        const warningSuffix = result.warningCount === 0 ? "" : ` (${result.warningCount} warnings)`;
        const loadedVerb = result.kind === "dxf" ? "Imported" : "Opened";
        activateScenePackage(result.scenePackage, {
          activeName: fileName,
          status: `${loadedVerb} ${fileName}${warningSuffix}`,
          semanticOverlayEnabled: true,
          semanticPanelOpen: false,
          timing: result.timing
        });

        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete("scene");
        window.history.pushState(null, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
      } catch (error) {
        if (!isCurrentSceneLoad(loadSerial)) return;
        setActiveSceneName(undefined);
        setSceneStatus("File open failed");
        setSceneLoadTiming([]);
        setSceneLoadError(
          error instanceof Error
            ? `Could not open ${fileName}. ${error.message}`
            : `Could not open ${fileName}. ${String(error)}`
        );
      }
    },
    [activateScenePackage, isCurrentSceneLoad, startSceneLoad]
  );

  const openLocalFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleLocalFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) {
      void loadLocalSceneFile(file);
    }
  };

  const handleDxfDragOver = (event: DragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    setDxfDragActive(true);
  };

  const handleDxfDragLeave = (event: DragEvent<HTMLElement>) => {
    if (event.currentTarget === event.target) {
      setDxfDragActive(false);
    }
  };

  const handleDxfDrop = (event: DragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    setDxfDragActive(false);
    const file = Array.from(event.dataTransfer.files).find((entry) => /\.(dxf|kairo)$/i.test(entry.name));
    if (file) {
      void loadLocalSceneFile(file);
      return;
    }
    startSceneLoad();
    setSceneStatus("File open failed");
    setSceneLoadError("Drop a .dxf or .kairo file to open it.");
    setSceneLoadTiming([]);
  };

  useEffect(() => {
    let cancelled = false;
    try {
      const request = resolveViewerSceneRequest(window.location.search);
      if (request.kind === "bundled") {
        return;
      }

      loadPublicScene(request.sceneName).then(() => {
        if (cancelled) return;
      });
    } catch (error) {
      setSceneStatus("Invalid scene request");
      setSceneLoadError(error instanceof Error ? error.message : String(error));
    }

    return () => {
      cancelled = true;
    };
  }, [loadPublicScene]);

  useEffect(() => {
    setSemanticDeviceOverrides({});
    setImportedLayoutReviewPack(undefined);
    setImportedReviewedTrainingTruth(undefined);
    setLayoutReviewStatus(undefined);
  }, [scenePackage]);

  const updateSelectedDeviceOverride = (patch: SemanticDeviceOverride) => {
    if (!selectedSemanticDevice) return;
    setSemanticDeviceOverrides((current) => ({
      ...current,
      [selectedSemanticDevice.id]: {
        ...(current[selectedSemanticDevice.id] ?? {}),
        ...patch
      }
    }));
  };

  const clearSelectedDeviceOverride = () => {
    if (!selectedSemanticDevice) return;
    setSemanticDeviceOverrides((current) => {
      const next = { ...current };
      delete next[selectedSemanticDevice.id];
      return next;
    });
  };

  const copySemanticExport = (format: "json" | "markdown") => {
    const content =
      format === "json" ? exportSemanticSummaryJson(semanticSummary) : exportSemanticSummaryMarkdown(semanticSummary);
    const writeText = navigator.clipboard?.writeText;
    if (!writeText) {
      setSemanticCopyStatus("Copy failed");
      return;
    }
    void writeText.call(navigator.clipboard, content)
      .then(() => setSemanticCopyStatus(format === "json" ? "Copied JSON" : "Copied Markdown"))
      .catch(() => setSemanticCopyStatus("Copy failed"));
  };

  const downloadSemanticExport = (format: "json" | "markdown") => {
    const content =
      format === "json" ? exportSemanticSummaryJson(semanticSummary) : exportSemanticSummaryMarkdown(semanticSummary);
    const extension = format === "json" ? "json" : "md";
    const mime = format === "json" ? "application/json" : "text/markdown";
    downloadTextFile(`kairo-semantic-summary.${extension}`, content, mime);
  };

  const downloadSemanticQaExport = (format: "json" | "markdown") => {
    const content =
      format === "json" ? exportSemanticQaReportJson(semanticQaReport) : exportSemanticQaReportMarkdown(semanticQaReport);
    const extension = format === "json" ? "json" : "md";
    const mime = format === "json" ? "application/json" : "text/markdown";
    downloadTextFile(`kairo-semantic-qa-report.${extension}`, content, mime);
  };

  const advancedLayoutExportContent = (format: AdvancedLayoutExportFormat) => {
    if (format === "json") return exportAdvancedLayoutJson(advancedLayoutModel);
    if (format === "csv") return exportAdvancedLayoutCsv(advancedLayoutModel);
    return exportAdvancedLayoutMarkdown(advancedLayoutModel);
  };

  const copyAdvancedLayoutExport = (format: AdvancedLayoutExportFormat) => {
    const writeText = navigator.clipboard?.writeText;
    if (!writeText) {
      setSemanticCopyStatus("Copy failed");
      return;
    }
    void writeText.call(navigator.clipboard, advancedLayoutExportContent(format))
      .then(() => setSemanticCopyStatus(format === "json" ? "Copied AE JSON" : format === "csv" ? "Copied AE CSV" : "Copied AE Markdown"))
      .catch(() => setSemanticCopyStatus("Copy failed"));
  };

  const downloadAdvancedLayoutExport = (format: AdvancedLayoutExportFormat) => {
    const extension = format === "json" ? "json" : format === "csv" ? "csv" : "md";
    const mime = format === "json" ? "application/json" : format === "csv" ? "text/csv" : "text/markdown";
    downloadTextFile(`kairo-advanced-layout.${extension}`, advancedLayoutExportContent(format), mime);
  };

  const layoutLibraryExportContent = (format: AdvancedLayoutExportFormat) => {
    if (format === "json") return exportLayoutPackageJson(layoutLibraryPackage);
    if (format === "csv") return exportLayoutPackageCsv(layoutLibraryPackage);
    return exportLayoutPackageMarkdown(layoutLibraryPackage);
  };

  const downloadLayoutLibraryExport = (format: AdvancedLayoutExportFormat) => {
    const extension = format === "json" ? "json" : format === "csv" ? "csv" : "md";
    const mime = format === "json" ? "application/json" : format === "csv" ? "text/csv" : "text/markdown";
    downloadTextFile(`kairo-layout-library-package.${extension}`, layoutLibraryExportContent(format), mime);
  };

  const openLayoutReviewPackPicker = () => {
    reviewPackInputRef.current?.click();
  };

  const openReviewedTrainingTruthPicker = () => {
    trainingTruthInputRef.current?.click();
  };

  const downloadLayoutReviewTemplate = () => {
    downloadTextFile("kairo-layout-review-template.json", exportLayoutReviewPackJson(blankLayoutReviewPack), "application/json");
  };

  const importLayoutReviewPack = async (file: File) => {
    try {
      const content = await file.text();
      const result = parseLayoutReviewPackJson(content, layoutLibraryPackage);
      if (!result.ok) {
        const first = result.errors[0];
        setImportedLayoutReviewPack(undefined);
        setLayoutReviewStatus(first ? `Review import failed: ${first.path} ${first.message}` : "Review import failed");
        return;
      }
      setImportedLayoutReviewPack(result.reviewPack);
      setImportedReviewedTrainingTruth(undefined);
      setLayoutReviewStatus(`Imported review pack: ${result.reviewPack.records.length} record(s)`);
    } catch (error) {
      setImportedLayoutReviewPack(undefined);
      setLayoutReviewStatus(error instanceof Error ? `Review import failed: ${error.message}` : "Review import failed");
    }
  };

  const handleLayoutReviewPackInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void importLayoutReviewPack(file);
  };

  const importReviewedTrainingTruth = async (file: File) => {
    try {
      const content = await file.text();
      const result = parseReviewedTrainingTruthJson(content);
      if (!result.ok) {
        const first = result.errors[0];
        setImportedReviewedTrainingTruth(undefined);
        setLayoutReviewStatus(first ? `Truth import failed: ${first.path} ${first.message}` : "Truth import failed");
        return;
      }
      setImportedReviewedTrainingTruth(result.trainingTruth);
      setImportedLayoutReviewPack(undefined);
      setLayoutReviewStatus(`Imported training truth: ${result.trainingTruth.records.length} record(s)`);
    } catch (error) {
      setImportedReviewedTrainingTruth(undefined);
      setLayoutReviewStatus(error instanceof Error ? `Truth import failed: ${error.message}` : "Truth import failed");
    }
  };

  const handleReviewedTrainingTruthInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void importReviewedTrainingTruth(file);
  };

  const reviewedTrainingTruthContent = (format: AdvancedLayoutExportFormat) => {
    if (format === "json") return exportReviewedTrainingTruthJson(reviewedTrainingTruth);
    if (format === "csv") return exportReviewedTrainingTruthCsv(reviewedTrainingTruth);
    return exportReviewedTrainingSummaryMarkdown(reviewedTrainingTruth);
  };

  const downloadReviewedTrainingTruth = (format: AdvancedLayoutExportFormat) => {
    const extension = format === "json" ? "json" : format === "csv" ? "csv" : "md";
    const mime = format === "json" ? "application/json" : format === "csv" ? "text/csv" : "text/markdown";
    const baseName =
      format === "markdown" ? "reviewed-training-summary" : format === "csv" ? "reviewed-training-truth" : "reviewed-training-truth";
    downloadTextFile(`${baseName}.${extension}`, reviewedTrainingTruthContent(format), mime);
  };

  const trainingTruthComparisonContent = (format: AdvancedLayoutExportFormat) => {
    if (format === "json") return exportTrainingTruthComparisonJson(trainingTruthComparison);
    if (format === "csv") return exportTrainingTruthComparisonCsv(trainingTruthComparison);
    return exportTrainingTruthComparisonMarkdown(trainingTruthComparison);
  };

  const downloadTrainingTruthComparison = (format: AdvancedLayoutExportFormat) => {
    const extension = format === "json" ? "json" : format === "csv" ? "csv" : "md";
    const mime = format === "json" ? "application/json" : format === "csv" ? "text/csv" : "text/markdown";
    downloadTextFile(`training-truth-comparison.${extension}`, trainingTruthComparisonContent(format), mime);
  };

  const reviewedLayoutLibraryContent = (format: AdvancedLayoutExportFormat) => {
    if (format === "json") return exportReviewedLayoutLibraryJson(reviewedLayoutLibrary);
    if (format === "csv") return exportReviewedLayoutLibraryCsv(reviewedLayoutLibrary);
    return exportReviewedLayoutLibraryMarkdown(reviewedLayoutLibrary);
  };

  const downloadReviewedLayoutLibrary = (format: AdvancedLayoutExportFormat) => {
    const extension = format === "json" ? "json" : format === "csv" ? "csv" : "md";
    const mime = format === "json" ? "application/json" : format === "csv" ? "text/csv" : "text/markdown";
    downloadTextFile(`reviewed-layout-library.${extension}`, reviewedLayoutLibraryContent(format), mime);
  };

  const compactSelectionStatus = selectedSemanticDetails
    ? `Semantic: ${selectedSemanticDetails.title}`
    : selectedEntity
    ? `Entity: ${selectedEntity.type} ${selectedEntity.entityId}`
    : `Node: ${selectedNode.displayName}`;
  const compactViewportStatus = viewportDiagnostics
    ? `${viewportDiagnostics.containerWidth}x${viewportDiagnostics.containerHeight}px / zoom ${viewportDiagnostics.cameraZoom.toFixed(2)}`
    : "Viewport pending";

  return (
    <main
      className={`app-shell${landingMode ? " landing-mode" : ""}${sceneIsLoading ? " loading-mode" : ""}${dxfDragActive ? " dxf-drag-active" : ""}`}
      onDragLeave={handleDxfDragLeave}
      onDragOver={handleDxfDragOver}
      onDrop={handleDxfDrop}
    >
      <section className="viewport-panel">
        <div className="viewport-toolbar">
          <div className="scene-summary" aria-label="Loaded scene summary">
            <strong>{sceneStatus}</strong>
            <span>
              {sceneStats.layerCount} layers / {sceneStats.geometryDocumentCount} geometry docs /{" "}
              {sceneStats.curveEntityCount} curves / {robustBounds.outlierEntityIds.length} outliers / v{APP_VERSION}
            </span>
          </div>
          <div className="toolbar-actions">
            <input
              ref={fileInputRef}
              accept=".dxf,.kairo"
              className="file-input"
              onChange={handleLocalFileInputChange}
              type="file"
            />
            <input
              ref={reviewPackInputRef}
              accept=".json,application/json"
              className="file-input"
              onChange={handleLayoutReviewPackInputChange}
              type="file"
            />
            <input
              ref={trainingTruthInputRef}
              accept=".json,application/json"
              className="file-input"
              onChange={handleReviewedTrainingTruthInputChange}
              type="file"
            />
            <button onClick={openLocalFilePicker} type="button">
              Open DXF / Kairo
            </button>
            <button onClick={() => loadPublicScene(DEMO_SCENE_NAME, { updateUrl: true })} type="button">
              Load Demo Layout
            </button>
            <span className="toolbar-divider" aria-hidden="true" />
            <button onClick={() => requestFit("scene")} type="button">
              Fit scene
            </button>
            <button onClick={() => requestFit("main")} type="button">
              Fit main
            </button>
            <button onClick={() => requestFit("raw")} type="button">
              Fit raw
            </button>
            <button onClick={() => requestFit("selected")} type="button">
              Fit selected
            </button>
            <button
              aria-pressed={viewMode === "top2d"}
              className={viewMode === "top2d" ? "active" : ""}
              onClick={() => setViewMode("top2d")}
              type="button"
            >
              Top 2D
            </button>
            <button
              aria-pressed={viewMode === "perspective"}
              className={viewMode === "perspective" ? "active" : ""}
              onClick={() => setViewMode("perspective")}
              type="button"
            >
              3D
            </button>
            <span className="toolbar-divider" aria-hidden="true" />
            <span className="toolbar-label">Labels</span>
            <button
              aria-pressed={labelDensity === "auto"}
              className={labelDensity === "auto" ? "active" : ""}
              onClick={() => setLabelDensity("auto")}
              title="Hide labels smaller than ~5px (cleaner fit-scene view)"
              type="button"
            >
              Auto
            </button>
            <button
              aria-pressed={labelDensity === "all"}
              className={labelDensity === "all" ? "active" : ""}
              onClick={() => setLabelDensity("all")}
              title="Show every label, clamping tiny labels up to 2px"
              type="button"
            >
              All
            </button>
            <button
              aria-pressed={labelDensity === "off"}
              className={labelDensity === "off" ? "active" : ""}
              onClick={() => setLabelDensity("off")}
              title="Hide all text labels"
              type="button"
            >
              Off
            </button>
            <button
              aria-pressed={readableOrientation}
              className={readableOrientation ? "active" : ""}
              onClick={() => setReadableOrientation((current) => !current)}
              title="Flip upside-down labels so they read left-to-right"
              type="button"
            >
              Readable
            </button>
            <button
              aria-pressed={showOutliers}
              className={showOutliers ? "active warning" : ""}
              onClick={() => {
                setShowOutliers((current) => !current);
                setFitRequest((current) => ({ target: current.target === "raw" ? "raw" : "main", serial: current.serial + 1 }));
              }}
              title="Show isolated far-away geometry normally hidden from the main layout view"
              type="button"
            >
              Show outliers
            </button>
            <button
              aria-pressed={semanticOverlayEnabled}
              className={semanticOverlayEnabled ? "active" : ""}
              onClick={() => {
                const nextEnabled = !semanticOverlayEnabled;
                setSemanticOverlayEnabled(nextEnabled);
                if (nextEnabled) setSemanticPanelOpen(true);
              }}
              title="Show station markers, device candidate bounds, and association lines"
              type="button"
            >
              Semantic overlay
            </button>
            <span className="toolbar-divider" aria-hidden="true" />
            <button
              aria-pressed={layersPanelOpen}
              className={layersPanelOpen ? "active" : ""}
              onClick={() => setLayersPanelOpen((current) => !current)}
              title="Show or hide the layer list without changing layer visibility"
              type="button"
            >
              Layers
            </button>
            <button
              aria-pressed={semanticOverlayEnabled && semanticPanelOpen}
              className={semanticOverlayEnabled && semanticPanelOpen ? "active" : ""}
              onClick={() => {
                if (!semanticOverlayEnabled) {
                  setSemanticOverlayEnabled(true);
                  setSemanticPanelOpen(true);
                } else {
                  setSemanticPanelOpen((current) => !current);
                }
              }}
              title="Show or hide the semantic validation panel"
              type="button"
            >
              Semantics
            </button>
            <button
              aria-pressed={inspectorPanelOpen}
              className={inspectorPanelOpen ? "active" : ""}
              onClick={() => setInspectorPanelOpen((current) => !current)}
              title="Show or hide selected entity properties"
              type="button"
            >
              Inspector
            </button>
            <span className="toolbar-divider" aria-hidden="true" />
            <button
              aria-controls="diagnostics-panel"
              aria-expanded={diagnosticsOpen}
              className={diagnosticsOpen ? "active" : ""}
              onClick={() => setDiagnosticsOpen((current) => !current)}
              type="button"
            >
              Diagnostics
            </button>
          </div>
        </div>
        <Viewport
          fitRequest={fitRequest}
          hiddenLayerIds={hiddenLayerIds}
          hiddenOutlierEntityIds={hiddenOutlierEntityIds}
          robustBounds={robustBounds}
          scenePackage={scenePackage}
          selectedNodeId={selectedNodeId}
          viewMode={viewMode}
          onSelect={selectViewport}
          labelDensity={labelDensity}
          readableOrientation={readableOrientation}
          semanticOverlayEnabled={semanticOverlayEnabled}
          semanticOverlayModel={semanticOverlayModel}
          onSelectSemantic={selectSemantic}
          onCursorLayoutPoint={updateCursorLayoutPoint}
          onViewportDiagnostics={setViewportDiagnostics}
        />
        {!landingMode && !sceneIsLoading ? (
          <div className="viewport-status-strip" aria-live="polite">
            <span>{compactSelectionStatus}</span>
            <span>{selectedLayerName ?? selectedLayerId ?? "No layer"}</span>
            <span>{viewMode === "top2d" ? "Top 2D" : "3D"}</span>
            <span>{compactViewportStatus}</span>
            <span>{showOutliers ? "Outliers shown" : `${robustBounds.outlierEntityIds.length} outliers hidden`}</span>
          </div>
        ) : null}
      </section>

      {dxfDragActive ? (
        <section className="dxf-drop-overlay" aria-label="Drawing file drop target">
          <strong>Drop DXF or Kairo package to open</strong>
        </section>
      ) : null}

      {landingMode ? (
        <section className="demo-landing" aria-labelledby="demo-landing-title">
          <div className="demo-copy">
            <span className="demo-version">Kairo Viewer v{APP_VERSION}</span>
            <h1 id="demo-landing-title">Open the whole DXF without losing the drawing.</h1>
            <p>
              A browser-native review surface for the staged Scott automotive layout: dense layers, exact entity picking,
              readable labels, and outlier-safe fit bounds.
            </p>
            <button onClick={openLocalFilePicker} type="button">
              Open DXF / Kairo
            </button>
          </div>
          <div className="demo-metrics" aria-label="Demo scene highlights">
            <span>
              <strong>246k</strong>
              curve/text entities
            </span>
            <span>
              <strong>160</strong>
              layers
            </span>
            <span>
              <strong>1,092</strong>
              labels
            </span>
          </div>
        </section>
      ) : null}

      {sceneIsLoading ? (
        <section className="scene-loading" role="status">
          <span>Opening drawing</span>
          <strong>{activeSceneName}</strong>
        </section>
      ) : null}

      {sceneLoadError ? (
        <section className="scene-error" role="alert">
          <strong>Scene could not be loaded</strong>
          <span>{sceneLoadError}</span>
          <button onClick={openLocalFilePicker} type="button">
            Open DXF / Kairo
          </button>
        </section>
      ) : null}

      {layersPanelOpen && !landingMode && !sceneIsLoading ? (
        <aside className="layers-shell">
          <LayerPanel
            hiddenLayerIds={hiddenLayerIds}
            layers={layerStats}
            selectedLayerId={selectedLayerId}
            onClose={() => setLayersPanelOpen(false)}
            onShowAllLayers={() => setHiddenLayerIds(new Set())}
            onToggleLayer={toggleLayer}
          />
        </aside>
      ) : null}

      {semanticOverlayEnabled && semanticPanelOpen && !landingMode && !sceneIsLoading ? (
        <section className="semantic-validation-panel" aria-label="Semantic validation panel">
          <div className="panel-heading">
            <span>Semantic validation</span>
            <div className="panel-heading-actions">
              <strong>
                {semanticAnalysisStatus === "pending"
                  ? "Analyzing..."
                  : `${semanticValidation.stations.length}/${semanticValidation.devices.length}`}
              </strong>
              <button className="panel-hide-button" type="button" onClick={() => setSemanticPanelOpen(false)}>
                Hide
              </button>
            </div>
          </div>
          <div className="semantic-summary-grid" aria-label="Semantic summary">
            <span>
              <strong>{semanticSummary.counts.stations}</strong>
              stations
            </span>
            <span>
              <strong>{semanticSummary.counts.devices}</strong>
              devices
            </span>
            <span>
              <strong>{semanticSummary.counts.linkedDevices}</strong>
              linked
            </span>
            <span>
              <strong>{semanticSummary.counts.ambiguousDevices}</strong>
              ambiguous
            </span>
            <span>
              <strong>{semanticSummary.counts.unlinkedDevices}</strong>
              unlinked
            </span>
            <span>
              <strong>{semanticSummary.counts.unknownLabels}</strong>
              unknown
            </span>
          </div>
          <div className="semantic-overlay-legend" aria-label="Semantic overlay legend">
            <span>
              <i className="legend-line linked" aria-hidden="true" />
              linked = solid line
            </span>
            <span>
              <i className="legend-line ambiguous" aria-hidden="true" />
              ambiguous = dashed/candidate
            </span>
            <span>
              <i className="legend-marker unlinked" aria-hidden="true" />
              unlinked = label marker only
            </span>
          </div>
          <div className="semantic-filter-grid">
            <label>
              <span>Station</span>
              <input
                aria-label="Station id search"
                onChange={(event) => updateSemanticFilters({ stationSearch: event.target.value })}
                placeholder="7B-010L"
                type="search"
                value={semanticFilters.stationSearch}
              />
            </label>
            <label>
              <span>Candidate type</span>
              <select
                aria-label="Device candidate type"
                onChange={(event) =>
                  updateSemanticFilters({
                    deviceKind: event.target.value as SemanticValidationFilters["deviceKind"]
                  })
                }
                value={semanticFilters.deviceKind}
              >
                <option value="all">All candidates</option>
                {DEVICE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {deviceKindLabel(kind)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Min confidence {semanticFilters.minConfidence.toFixed(2)}</span>
              <input
                aria-label="Minimum confidence"
                max="1"
                min="0"
                onChange={(event) => updateSemanticFilters({ minConfidence: Number(event.target.value) })}
                step="0.05"
                type="range"
                value={semanticFilters.minConfidence}
              />
            </label>
            <label className="semantic-check">
              <input
                checked={semanticFilters.showUnknownLabels}
                onChange={(event) => updateSemanticFilters({ showUnknownLabels: event.target.checked })}
                type="checkbox"
              />
              <span>Show unknown labels</span>
            </label>
            <label className="semantic-check">
              <input
                checked={semanticFilters.showUnassignedDevices}
                onChange={(event) => updateSemanticFilters({ showUnassignedDevices: event.target.checked })}
                type="checkbox"
              />
              <span>Show unassigned candidates</span>
            </label>
          </div>
          <div className="semantic-panel-actions">
            <button onClick={() => requestFit("main")} type="button">
              Fit main
            </button>
            <button onClick={() => requestFit("raw")} type="button">
              Fit raw
            </button>
            <button
              aria-pressed={showOutliers}
              className={showOutliers ? "active warning" : ""}
              onClick={() => {
                setShowOutliers((current) => !current);
                setFitRequest((current) => ({ target: current.target === "raw" ? "raw" : "main", serial: current.serial + 1 }));
              }}
              type="button"
            >
              Show outliers
            </button>
            <button onClick={() => copySemanticExport("json")} type="button">
              Copy JSON
            </button>
            <button onClick={() => copySemanticExport("markdown")} type="button">
              Copy MD
            </button>
            <button onClick={() => downloadSemanticExport("json")} type="button">
              Download JSON
            </button>
            <button onClick={() => downloadSemanticExport("markdown")} type="button">
              Download MD
            </button>
            <button onClick={() => downloadSemanticQaExport("markdown")} type="button">
              Download QA MD
            </button>
            <button onClick={() => downloadSemanticQaExport("json")} type="button">
              Download QA JSON
            </button>
            <span className="semantic-action-divider" aria-hidden="true" />
            <button onClick={() => copyAdvancedLayoutExport("json")} type="button">
              Copy AE JSON
            </button>
            <button onClick={() => copyAdvancedLayoutExport("csv")} type="button">
              Copy AE CSV
            </button>
            <button onClick={() => copyAdvancedLayoutExport("markdown")} type="button">
              Copy AE MD
            </button>
            <button onClick={() => downloadAdvancedLayoutExport("json")} type="button">
              Download AE JSON
            </button>
            <button onClick={() => downloadAdvancedLayoutExport("csv")} type="button">
              Download AE CSV
            </button>
            <button onClick={() => downloadAdvancedLayoutExport("markdown")} type="button">
              Download AE MD
            </button>
            <span className="semantic-action-divider" aria-hidden="true" />
            <button onClick={() => downloadLayoutLibraryExport("json")} type="button">
              Download Library JSON
            </button>
            <button onClick={() => downloadLayoutLibraryExport("csv")} type="button">
              Download Library CSV
            </button>
            <button onClick={() => downloadLayoutLibraryExport("markdown")} type="button">
              Download Library MD
            </button>
            <span className="semantic-action-divider" aria-hidden="true" />
            <button onClick={downloadLayoutReviewTemplate} type="button">
              Download Review Template
            </button>
            <button onClick={openLayoutReviewPackPicker} type="button">
              Import Review JSON
            </button>
            <button onClick={() => downloadReviewedTrainingTruth("json")} type="button">
              Download Truth JSON
            </button>
            <button onClick={() => downloadReviewedTrainingTruth("csv")} type="button">
              Download Truth CSV
            </button>
            <button onClick={() => downloadReviewedTrainingTruth("markdown")} type="button">
              Download Truth MD
            </button>
            <button onClick={openReviewedTrainingTruthPicker} type="button">
              Import Truth JSON
            </button>
            <button onClick={() => downloadTrainingTruthComparison("json")} type="button">
              Download Compare JSON
            </button>
            <button onClick={() => downloadTrainingTruthComparison("csv")} type="button">
              Download Compare CSV
            </button>
            <button onClick={() => downloadTrainingTruthComparison("markdown")} type="button">
              Download Compare MD
            </button>
            <button onClick={() => downloadReviewedLayoutLibrary("json")} type="button">
              Download Reviewed Library JSON
            </button>
            <button onClick={() => downloadReviewedLayoutLibrary("csv")} type="button">
              Download Reviewed Library CSV
            </button>
            <button onClick={() => downloadReviewedLayoutLibrary("markdown")} type="button">
              Download Reviewed Library MD
            </button>
            {layoutReviewStatus ? (
              <span className="semantic-copy-status" role="status">
                {layoutReviewStatus}
              </span>
            ) : null}
            {semanticCopyStatus ? (
              <span className="semantic-copy-status" role="status">
                {semanticCopyStatus}
              </span>
            ) : null}
          </div>
          <div className="semantic-validation-lists">
            <section>
              <div className="semantic-list-heading">
                <h3>Stations</h3>
                {stationListCount ? <span>{stationListCount}</span> : null}
              </div>
              {semanticValidation.stations.length === 0 ? (
                <p>No station candidates match the filters.</p>
              ) : (
                <ol>
                  {visibleSemanticStations.map((station) => (
                    <li key={station.stationId}>
                      <button
                        className={
                          selectedSemantic?.kind === "station" && selectedSemantic.id === station.stationId ? "selected" : ""
                        }
                        onClick={() => selectSemantic({ kind: "station", id: station.stationId })}
                        type="button"
                      >
                        <strong>{station.stationId}</strong>
                        <span>
                          {station.processName} / side {station.side} / {station.deviceIds.length} candidate(s) / conf{" "}
                          {station.confidence.toFixed(2)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section>
              <div className="semantic-list-heading">
                <h3>Device candidates</h3>
                {deviceListCount ? <span>{deviceListCount}</span> : null}
              </div>
              {semanticValidation.devices.length === 0 ? (
                <p>No device candidates match the filters.</p>
              ) : (
                <ol>
                  {visibleSemanticDevices.map((device) => {
                    const statusLabel = semanticStatusLabel(device.associationStatus, semanticDeviceOverrides[device.id]);
                    const displayLabel = device.displayText ?? safeDisplayText(device.labelText);
                    return (
                      <li key={device.id}>
                        <button
                          className={selectedSemantic?.kind === "device" && selectedSemantic.id === device.id ? "selected" : ""}
                          onClick={() => selectSemantic({ kind: "device", id: device.id })}
                          type="button"
                          title={device.rawText ?? device.normalizedText}
                        >
                          <span className="semantic-row-top">
                            <strong>{displayLabel}</strong>
                            <span className={`semantic-status ${statusLabel.toLowerCase()}`}>{statusLabel}</span>
                          </span>
                          <span>
                            {deviceKindLabel(device.kind)} / {device.stationId ?? "unassigned"} / conf{" "}
                            {device.confidence.toFixed(2)} / linked {device.linkedEntityIds.length}
                          </span>
                          <em>{semanticReasonPreview([...device.evidence, ...device.associationReason])}</em>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
            {semanticFilters.showUnknownLabels ? (
              <section>
                <div className="semantic-list-heading">
                  <h3>Unknown labels</h3>
                  {unknownListCount ? <span>{unknownListCount}</span> : null}
                </div>
                {semanticValidation.unknownTextEntities.length === 0 ? (
                  <p>No unknown labels match the filters.</p>
                ) : (
                  <ol>
                    {visibleUnknownText.map((text) => (
                      <li key={text.entityId}>
                        <button
                          className={
                            selectedSemantic?.kind === "unknown-text" && selectedSemantic.id === text.entityId ? "selected" : ""
                          }
                          onClick={() => selectSemantic({ kind: "unknown-text", id: text.entityId })}
                          type="button"
                          title={text.rawText ?? text.normalizedText}
                        >
                          <strong>{text.displayText ?? safeDisplayText(text.normalizedText)}</strong>
                          <span>
                            {text.noteKind ?? text.sourceKind} / {text.layerId ?? "no layer"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            ) : null}
            <section>
              <h3>Outlier sanity</h3>
              <p>{outlierSummary.outlierCount} outlier entities hidden from normal fit.</p>
              <div className="semantic-outlier-grid">
                <div>
                  <strong>Top layers</strong>
                  <ol>
                    {outlierSummary.topLayers.slice(0, 5).map((layer) => (
                      <li key={layer.layerId}>
                        {layer.layerId}: {layer.count}
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <strong>Farthest</strong>
                  <ol>
                    {outlierSummary.topOutliers.slice(0, 5).map((entry) => (
                      <li key={entry.entityId}>
                        {entry.entityId} / {entry.type} / {entry.distanceFromMainCluster.toFixed(0)}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {inspectorPanelOpen && !landingMode && !sceneIsLoading ? (
      <aside className="properties-panel">
        <div className="panel-heading">
          <span>{selectedSemanticDetails ? "Semantic selection" : selectedEntity ? "Selected entity" : "Selected node"}</span>
          <div className="panel-heading-actions">
            <strong>
              {selectedSemanticDetails ? "candidate" : selectedEntity ? selectedEntity.type : selectedNode.type}
            </strong>
            <button className="panel-hide-button" type="button" onClick={() => setInspectorPanelOpen(false)}>
              Hide
            </button>
          </div>
        </div>
        <div className="selection-summary">
          <strong>{selectedSemanticDetails?.title ?? selectedEntity?.entityId ?? selectedNode.displayName}</strong>
          <span>{selectedSemanticDetails?.subtitle ?? selectedLayerName ?? selectedLayerId ?? "No layer"}</span>
        </div>
        <dl>
          <dt>Layout</dt>
          <dd>
            {activeLayout.fileName} / {activeLayout.type}
            {activeLayout.locked ? " / locked" : ""}
          </dd>
          <dt>Layout origin</dt>
          <dd>{formatLayoutPoint(coordinateReadout.selectedLayoutOrigin)}</dd>
          <dt>Cursor world</dt>
          <dd>{formatLayoutPoint(coordinateReadout.cursorWorld)}</dd>
          <dt>Selection world</dt>
          <dd>{formatLayoutPoint(coordinateReadout.selectedWorld)}</dd>
          {selectedSemanticDetails ? (
            <>
              <dt>Kind</dt>
              <dd>{selectedSemanticDetails.selection.kind}</dd>
              {selectedSemanticDetails.displayText ? (
                <>
                  <dt>Primary label</dt>
                  <dd className="semantic-full-text">{selectedSemanticDetails.displayText}</dd>
                </>
              ) : null}
              {selectedSemanticDetails.rawText ? (
                <>
                  <dt>Raw text</dt>
                  <dd className="semantic-full-text">{selectedSemanticDetails.rawText}</dd>
                </>
              ) : null}
              {selectedSemanticDetails.associationText ? (
                <>
                  <dt>Association text</dt>
                  <dd className="semantic-full-text">{selectedSemanticDetails.associationText}</dd>
                </>
              ) : null}
              {selectedSemanticDetails.noteKind ? (
                <>
                  <dt>Text class</dt>
                  <dd>{selectedSemanticDetails.noteKind}</dd>
                </>
              ) : null}
              {selectedSemanticDetails.stationId ? (
                <>
                  <dt>Station</dt>
                  <dd>{selectedSemanticDetails.stationId}</dd>
                </>
              ) : null}
              {selectedSemanticDetails.candidateKind ? (
                <>
                  <dt>Candidate type</dt>
                  <dd>{deviceKindLabel(selectedSemanticDetails.candidateKind)}</dd>
                </>
              ) : null}
              {selectedSemanticDetails.associationMethod ? (
                <>
                  <dt>Association</dt>
                  <dd>{selectedSemanticDetails.associationMethod}</dd>
                </>
              ) : null}
              {selectedSemanticDetails.geometryAssociationStatus ? (
                <>
                  <dt>Geometry link</dt>
                  <dd>
                    {selectedSemanticDetails.geometryAssociationStatus} /{" "}
                    {selectedSemanticDetails.linkedEntityIds.length} linked entity id(s)
                  </dd>
                </>
              ) : null}
              <dt>Confidence</dt>
              <dd>{formatConfidence(selectedSemanticDetails.confidence)}</dd>
              <dt>Source text</dt>
              <dd>{selectedSemanticDetails.sourceTextEntityIds.join(", ") || "none"}</dd>
              <dt>Linked ids</dt>
              <dd>{compactIdList(selectedSemanticDetails.linkedEntityIds)}</dd>
              {selectedSemanticDetails.associationCandidates.length > 0 ? (
                <>
                  <dt>Candidates</dt>
                  <dd>
                    {selectedSemanticDetails.associationCandidates
                      .slice(0, 4)
                      .map(
                        (candidate) =>
                          `${candidate.groupId} (${candidate.confidence.toFixed(2)}, ${Math.round(candidate.distanceToBounds)} mm)`
                      )
                      .join("; ")}
                  </dd>
                </>
              ) : null}
              <dt>Nearby geometry</dt>
              <dd>{selectedSemanticDetails.nearbyEntityIds.length} tracked entities</dd>
              <dt>Bounds</dt>
              <dd>{formatBounds(selectedSemanticDetails.bounds ?? null)}</dd>
              <dt>Evidence</dt>
              <dd>{selectedSemanticDetails.evidence.join(", ") || "heuristic match"}</dd>
              {selectedSemanticDevice ? (
                <>
                  <dt>Override</dt>
                  <dd>
                    <div className="semantic-override-controls">
                      <span className="semantic-override-state">
                        {selectedSemanticOverride ? "Override applied" : "No override applied"}
                      </span>
                      <label>
                        <span>Class</span>
                        <select
                          value={selectedSemanticOverride?.kind ?? selectedSemanticDevice.kind}
                          onChange={(event) =>
                            updateSelectedDeviceOverride({ kind: event.target.value as DeviceKind })
                          }
                        >
                          {DEVICE_KINDS.map((kind) => (
                            <option key={kind} value={kind}>
                              {deviceKindLabel(kind)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Geometry</span>
                        <select
                          value={
                            selectedSemanticOverride?.unlink
                              ? "__unlink"
                              : selectedSemanticOverride?.geometryGroupId ?? selectedSemanticDevice.geometryGroupId ?? ""
                          }
                          onChange={(event) => {
                            const value = event.target.value;
                            if (value === "__unlink") {
                              updateSelectedDeviceOverride({ geometryGroupId: undefined, unlink: true });
                              return;
                            }
                            updateSelectedDeviceOverride({ geometryGroupId: value || undefined, unlink: false });
                          }}
                        >
                          <option value="">Auto: {selectedSemanticDevice.associationStatus}</option>
                          <option value="__unlink">Manual unlinked</option>
                          {selectedSemanticDevice.associationCandidates.map((candidate) => (
                            <option key={candidate.groupId} value={candidate.groupId}>
                              {candidate.groupId} ({candidate.confidence.toFixed(2)})
                            </option>
                          ))}
                        </select>
                      </label>
                      <button onClick={clearSelectedDeviceOverride} type="button">
                        Revert override
                      </button>
                    </div>
                  </dd>
                </>
              ) : null}
            </>
          ) : (
            <>
          <dt>ID</dt>
          <dd>{selectedEntity?.entityId ?? selectedNode.id}</dd>
          <dt>Type</dt>
          <dd>{sourceEntry?.entityType ?? selectedEntity?.type ?? selectedNode.type}</dd>
          {selectedSourceRef ? (
            <>
              <dt>Source ref</dt>
              <dd>{selectedSourceRef}</dd>
            </>
          ) : null}
          {selectedLayerId ? (
            <>
              <dt>Layer</dt>
              <dd>{selectedLayerName ? `${selectedLayerName} (${selectedLayerId})` : selectedLayerId}</dd>
            </>
          ) : null}
          {!selectedEntity ? (
            <>
              <dt>Name</dt>
              <dd>{selectedNode.displayName}</dd>
            </>
          ) : null}
          {selectedEntity ? (
            <>
              <dt>Batch node</dt>
              <dd>{selectedNode.id}</dd>
            </>
          ) : null}
          {selectedEntitySemanticDevice ? (
            <>
              <dt>Assigned semantic</dt>
              <dd>
                {deviceKindLabel(selectedEntitySemanticDevice.kind)} /{" "}
                {selectedEntitySemanticDevice.displayText ?? safeDisplayText(selectedEntitySemanticDevice.labelText)} /{" "}
                {selectedEntitySemanticDevice.confidence.toFixed(2)}
              </dd>
            </>
          ) : null}
          {selectedEntity || sourceEntry?.entityType ? (
            <>
              <dt>Source type</dt>
              <dd>{sourceEntry?.entityType ?? selectedEntity?.type.toUpperCase()}</dd>
            </>
          ) : null}
          {sourceEntry?.entityId ? (
            <>
              <dt>Entity ID</dt>
              <dd>{sourceEntry.entityId}</dd>
            </>
          ) : null}
          {sourceEntry?.note ? (
            <>
              <dt>Note</dt>
              <dd>{sourceEntry.note}</dd>
            </>
          ) : null}
          {parsedRef && parsedRef.kind !== "unknown" && parsedRef.kind !== "file" ? (
            <>
              <dt>Kind</dt>
              <dd>{parsedRef.kind}</dd>
            </>
          ) : null}
          {parsedRef && (parsedRef.kind === "direct" || parsedRef.kind === "mtext") ? (
            <>
              <dt>Handle</dt>
              <dd>{parsedRef.handle}</dd>
            </>
          ) : null}
          {parsedRef && parsedRef.kind === "block-child" ? (
            <>
              <dt>Insert</dt>
              <dd>{parsedRef.insertHandle}</dd>
              <dt>Block</dt>
              <dd>{parsedRef.blockName}</dd>
              <dt>Child</dt>
              <dd>{parsedRef.childHandle}</dd>
            </>
          ) : null}
            </>
          )}
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
      </aside>
      ) : null}

      {diagnosticsOpen ? (
        <section
          className={report.valid ? "diagnostics valid" : "diagnostics invalid"}
          id="diagnostics-panel"
        >
          <div className="diagnostics-summary">
            <strong>{report.valid ? "Validation passed" : "Validation failed"}</strong>
            <span>
              {report.summary.errors} errors, {report.summary.warnings} warnings
            </span>
            <span>
              {sceneStats.nodeCount} nodes, {sceneStats.layerCount} layers, {sceneStats.geometryDocumentCount} geometry docs,{" "}
              {sceneStats.curveEntityCount} curve entities
            </span>
            <span>
              Semantics: {layoutSemantics.stations.length} stations / {layoutSemantics.devices.length} device candidates from{" "}
              {layoutSemantics.textEntities.length} text labels
              {semanticAnalysisTiming ? ` / ${formatTimingMs(semanticAnalysisTiming.ms)}` : ""}
            </span>
            <span>
              Layout map: {jobSession.layoutMap.layouts.length} layout(s), active {jobSession.layoutMap.activeLayoutId}, origin{" "}
              {formatLayoutPoint(coordinateReadout.selectedLayoutOrigin)}
            </span>
            {sceneLoadTiming.length > 0 ? (
              <span>
                Load timing:{" "}
                {sceneLoadTiming.map((entry) => `${entry.stage}=${formatTimingMs(entry.ms)}`).join(" / ")}
              </span>
            ) : null}
            {viewportDiagnostics ? (
              <>
                <span>
                  Viewport: {viewportDiagnostics.containerWidth}x{viewportDiagnostics.containerHeight} CSS px, canvas{" "}
                  {viewportDiagnostics.canvasWidth}x{viewportDiagnostics.canvasHeight}
                </span>
                <span>
                  DPR: window {viewportDiagnostics.devicePixelRatio.toFixed(2)}, renderer{" "}
                  {viewportDiagnostics.rendererPixelRatio.toFixed(2)}, camera zoom{" "}
                  {viewportDiagnostics.cameraZoom.toFixed(2)}
                </span>
                <span>
                  Fit size: {viewportDiagnostics.fitBoundsWidth.toFixed(2)} x{" "}
                  {viewportDiagnostics.fitBoundsHeight.toFixed(2)}
                  {viewportDiagnostics.browserZoomWarning ? " / browser zoom or high-DPR display detected" : ""}
                </span>
                {viewportDiagnostics.timing?.length ? (
                  <span>
                    View timing:{" "}
                    {viewportDiagnostics.timing.map((entry) => `${entry.stage}=${formatTimingMs(entry.ms)}`).join(" / ")}
                  </span>
                ) : null}
              </>
            ) : null}
            <span>
              Outliers: {robustBounds.outlierEntityIds.length} ({showOutliers ? "shown" : "hidden from main view"})
            </span>
            <span>Raw bounds: {formatBounds(robustBounds.rawBounds)}</span>
            <span>Fit bounds: {formatBounds(robustBounds.fitBounds)}</span>
            <span>Outlier bounds: {formatBounds(robustBounds.outlierBounds)}</span>
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
          <div className="bounds-diagnostics">
            <div className="panel-heading">
              <span>Farthest entities</span>
              <strong>{robustBounds.topOutliers.length}</strong>
            </div>
            {robustBounds.topOutliers.length === 0 ? (
              <p>No outlier entities classified.</p>
            ) : (
              <ol>
                {robustBounds.topOutliers.map((entry) => (
                  <li key={entry.entityId}>
                    <strong>{entry.entityId}</strong> {entry.type} layer={entry.layerId ?? "none"} dist=
                    {entry.distanceFromMainCluster.toFixed(1)} size=[{formatVec3(entry.size)}] bounds=
                    {formatBounds(entry.bounds)}
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="semantic-diagnostics">
            <div className="panel-heading">
              <span>Semantics</span>
              <strong>
                {layoutSemantics.stations.length}/{layoutSemantics.devices.length}
              </strong>
            </div>
            <h3>Stations</h3>
            {layoutSemantics.stations.length === 0 ? (
              <p>No station labels detected.</p>
            ) : (
              <ol>
                {layoutSemantics.stations.slice(0, 40).map((station) => (
                  <li key={`${station.stationId}-${station.sourceTextEntityIds.join("-")}`}>
                    <strong>{station.stationId}</strong> {station.processName} side={station.side} pos=[
                    {formatVec3(station.position)}] nearby={station.nearbyEntityIds.length} confidence=
                    {station.confidence.toFixed(2)}
                    <span>
                      candidates:{" "}
                      {station.deviceIds
                        .slice(0, 4)
                        .map((deviceId) => {
                          const device = semanticDevicesById.get(deviceId);
                          if (!device) return deviceId;
                          return `${device.kind}(${device.nearbyEntityIds.length}, ${device.confidence.toFixed(2)})`;
                        })
                        .join(", ") || "none"}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <h3>Device candidates</h3>
            {layoutSemantics.devices.length === 0 ? (
              <p>No device candidate labels classified.</p>
            ) : (
              <ol>
                {layoutSemantics.devices.slice(0, 50).map((device) => (
                  <li key={device.id}>
                    <strong>{device.kind}</strong> station={device.stationId ?? "none"} method=
                    {device.stationAssociationMethod} confidence={device.confidence.toFixed(2)} nearby=
                    {device.nearbyEntityIds.length}
                    <span>
                      heuristic match: {device.labelText} [{device.sourceTextEntityIds.join(", ")}]
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="diagnostics-tree">
            <div className="panel-heading">
              <span>Scene tree</span>
              <strong>{scenePackage.scene.nodes.length}</strong>
            </div>
            <TreeNode
              node={rootNode}
              depth={0}
              selectedNodeId={selectedNodeId}
              nodeMap={nodeMap}
              onSelect={selectNode}
            />
          </div>
        </section>
      ) : null}
    </main>
  );
}
