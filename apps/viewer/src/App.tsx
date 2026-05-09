import { geometryById, nodesById, sourcePathForNode } from "@kairo/core";
import type { DrawingEntity, Geometry, SceneNode } from "@kairo/schema";
import { validateScenePackage } from "@kairo/validator";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { sampleScenePackage } from "./sampleScene";

type RenderRecord = {
  object: THREE.Object3D;
  nodeId: string;
  baseColor: THREE.Color;
  material: THREE.Material | THREE.Material[];
};

const selectedColor = new THREE.Color("#ffb020");
const matrixFromArray = (values: number[]) => new THREE.Matrix4().fromArray(values);

function layerColor(layerId?: string): THREE.Color {
  const layer = sampleScenePackage.layers.layers.find((entry) => entry.id === layerId);
  if (!layer?.color) {
    return new THREE.Color("#7f8b94");
  }
  return new THREE.Color(layer.color.r, layer.color.g, layer.color.b);
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

function makeMesh(geometry: Extract<Geometry, { kind: "mesh" }>) {
  const bufferGeometry = new THREE.BufferGeometry();
  bufferGeometry.setAttribute("position", new THREE.Float32BufferAttribute(geometry.vertices, 3));
  bufferGeometry.setIndex(geometry.indices);
  bufferGeometry.computeVertexNormals();

  const materialColor = sampleScenePackage.materials.materials.find((material) => material.id === geometry.materialId)
    ?.baseColor;
  const material = new THREE.MeshStandardMaterial({
    color: materialColor
      ? new THREE.Color(materialColor.r, materialColor.g, materialColor.b)
      : layerColor(geometry.layerId),
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
  for (let i = 0; i <= 64; i += 1) {
    const angle = (i / 64) * Math.PI * 2;
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
  for (let i = 0; i <= 48; i += 1) {
    const angle = start + ((end - start) * i) / 48;
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

function pointsForEntity(entity: DrawingEntity) {
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

  return pointsForArc(entity);
}

function makeCurveSet(geometry: Extract<Geometry, { kind: "curve-set" }>) {
  const group = new THREE.Group();
  for (const entity of geometry.entities) {
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(pointsForEntity(entity));
    const lineMaterial = new THREE.LineBasicMaterial({ color: layerColor(entity.layerId ?? geometry.layerId) });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    group.add(line);
  }
  return group;
}

function applyHighlight(records: RenderRecord[], selectedNodeId: string) {
  for (const record of records) {
    const color = record.nodeId === selectedNodeId ? selectedColor : record.baseColor;
    const materials = Array.isArray(record.material) ? record.material : [record.material];
    for (const material of materials) {
      if ("color" in material && material.color instanceof THREE.Color) {
        material.color.copy(color);
      }
    }
  }
}

function Viewport({
  selectedNodeId,
  onSelect
}: {
  selectedNodeId: string;
  onSelect: (nodeId: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const recordsRef = useRef<RenderRecord[]>([]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f6f8fa");

    const camera = new THREE.PerspectiveCamera(45, host.clientWidth / host.clientHeight, 0.1, 2000);
    camera.position.set(115, -135, 95);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight("#ffffff", 1.7);
    const key = new THREE.DirectionalLight("#ffffff", 2);
    key.position.set(90, -70, 130);
    scene.add(ambient, key);

    const grid = new THREE.GridHelper(160, 16, "#c8d1d8", "#e1e6ea");
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);

    const nodeMap = nodesById(sampleScenePackage);
    const geometryMap = geometryById(sampleScenePackage);
    const records: RenderRecord[] = [];

    for (const node of sampleScenePackage.scene.nodes) {
      for (const geometryRef of node.geometryRefs ?? []) {
        const geometry = geometryMap.get(geometryRef);
        if (!geometry) {
          continue;
        }

        const object = geometry.kind === "mesh" ? makeMesh(geometry) : makeCurveSet(geometry);
        object.name = node.displayName;
        object.userData.nodeId = node.id;
        object.applyMatrix4(matrixFromArray(node.localTransform));
        scene.add(object);

        const material =
          geometry.kind === "mesh"
            ? (object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material
            : (object as THREE.Group).children.flatMap((child) => {
                const line = child as THREE.Line;
                return Array.isArray(line.material) ? line.material : [line.material];
              });

        records.push({
          object,
          nodeId: node.id,
          baseColor: layerColor(node.layerId ?? geometry.layerId),
          material
        });
      }
    }

    recordsRef.current = records;
    applyHighlight(records, selectedNodeId);

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
          onSelect(current.userData.nodeId);
        }
      }
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    const resize = () => {
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      host.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [onSelect]);

  useEffect(() => {
    applyHighlight(recordsRef.current, selectedNodeId);
  }, [selectedNodeId]);

  return <div className="viewport" ref={hostRef} />;
}

export function App() {
  const nodeMap = useMemo(() => nodesById(sampleScenePackage), []);
  const [selectedNodeId, setSelectedNodeId] = useState(sampleScenePackage.scene.rootNodeId);
  const selectedNode = nodeMap.get(selectedNodeId) ?? sampleScenePackage.scene.nodes[0];
  const report = useMemo(() => validateScenePackage(sampleScenePackage), []);
  const rootNode = nodeMap.get(sampleScenePackage.scene.rootNodeId)!;
  const sourcePath = sourcePathForNode(sampleScenePackage, selectedNode);

  return (
    <main className="app-shell">
      <aside className="tree-panel">
        <div className="panel-heading">
          <span>Scene Tree</span>
          <strong>{sampleScenePackage.scene.nodes.length}</strong>
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
          <span>{sampleScenePackage.manifest.format}</span>
          <span>{sampleScenePackage.manifest.units}</span>
          <span>{sampleScenePackage.manifest.axisSystem.up}-up</span>
        </div>
        <Viewport selectedNodeId={selectedNodeId} onSelect={setSelectedNodeId} />
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
      </aside>

      <section className={report.valid ? "diagnostics valid" : "diagnostics invalid"}>
        <div>
          <strong>{report.valid ? "Validation passed" : "Validation failed"}</strong>
          <span>
            {report.summary.errors} errors, {report.summary.warnings} warnings
          </span>
        </div>
        <ol>
          {report.findings.length === 0 ? (
            <li>No validation findings for the included sample scene.</li>
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
