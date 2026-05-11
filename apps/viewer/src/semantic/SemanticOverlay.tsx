import type { Bounds3, Vec3 } from "@kairo/core";
import type { MouseEvent } from "react";
import * as THREE from "three";
import type { TextOverlayCamera } from "../SceneTextOverlay";
import type { SemanticOverlayModel, SemanticSelection } from "./semanticValidation";

type ProjectedPoint = {
  x: number;
  y: number;
  inFrustum: boolean;
};

type ProjectedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const scratch = new THREE.Vector3();

function projectPoint(point: Vec3, camera: TextOverlayCamera, width: number, height: number): ProjectedPoint {
  scratch.set(point[0], point[1], point[2]);
  scratch.project(camera);
  return {
    x: (scratch.x + 1) * 0.5 * width,
    y: (1 - scratch.y) * 0.5 * height,
    inFrustum: scratch.z >= -1 && scratch.z <= 1
  };
}

function boundsCorners(bounds: Bounds3): Vec3[] {
  return [
    [bounds.min[0], bounds.min[1], bounds.min[2]],
    [bounds.max[0], bounds.min[1], bounds.min[2]],
    [bounds.max[0], bounds.max[1], bounds.min[2]],
    [bounds.min[0], bounds.max[1], bounds.min[2]],
    [bounds.min[0], bounds.min[1], bounds.max[2]],
    [bounds.max[0], bounds.min[1], bounds.max[2]],
    [bounds.max[0], bounds.max[1], bounds.max[2]],
    [bounds.min[0], bounds.max[1], bounds.max[2]]
  ];
}

function projectBounds(bounds: Bounds3, camera: TextOverlayCamera, width: number, height: number): ProjectedRect | undefined {
  const points = boundsCorners(bounds).map((corner) => projectPoint(corner, camera, width, height));
  if (!points.some((point) => point.inFrustum)) return undefined;

  const xs = points.map((point) => point.x).filter(Number.isFinite);
  const ys = points.map((point) => point.y).filter(Number.isFinite);
  if (xs.length === 0 || ys.length === 0) return undefined;

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rectWidth = Math.max(maxX - minX, 8);
  const rectHeight = Math.max(maxY - minY, 8);
  return {
    x: minX,
    y: minY,
    width: rectWidth,
    height: rectHeight
  };
}

function clickSelection(selection: SemanticSelection, onSelect: (selection: SemanticSelection) => void) {
  return (event: MouseEvent<SVGElement>) => {
    event.stopPropagation();
    onSelect(selection);
  };
}

export function SemanticOverlay({
  enabled,
  model,
  camera,
  host,
  rafTick,
  onSelect
}: {
  enabled: boolean;
  model: SemanticOverlayModel;
  camera: TextOverlayCamera | null;
  host: HTMLElement | null;
  rafTick: number;
  onSelect: (selection: SemanticSelection) => void;
}) {
  if (!enabled || !camera || !host) return null;
  const width = host.clientWidth;
  const height = host.clientHeight;
  if (width <= 0 || height <= 0) return null;

  const selectedRect = model.selectedBounds ? projectBounds(model.selectedBounds, camera, width, height) : undefined;

  return (
    <svg
      aria-hidden="true"
      className="semantic-overlay"
      data-raf-tick={rafTick}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
    >
      <g className="semantic-association-lines">
        {model.associationLines.map((line) => {
          const from = projectPoint(line.from, camera, width, height);
          const to = projectPoint(line.to, camera, width, height);
          if (!from.inFrustum && !to.inFrustum) return null;
          return (
            <line
              className={line.selected ? "selected" : ""}
              key={line.id}
              x1={from.x}
              x2={to.x}
              y1={from.y}
              y2={to.y}
            />
          );
        })}
      </g>

      <g className="semantic-device-candidate-bounds">
        {model.deviceCandidates.map((device) => {
          const rect = projectBounds(device.bounds, camera, width, height);
          if (!rect) return null;
          return (
            <rect
              className={device.selected ? "selected" : ""}
              height={rect.height}
              key={device.id}
              onClick={clickSelection({ kind: "device", id: device.id }, onSelect)}
              rx={3}
              width={rect.width}
              x={rect.x}
              y={rect.y}
            >
              <title>{`${device.kind} heuristic match: ${device.label}`}</title>
            </rect>
          );
        })}
      </g>

      <g className="semantic-station-markers">
        {model.stations.map((station) => {
          const point = projectPoint(station.position, camera, width, height);
          if (!point.inFrustum) return null;
          return (
            <g
              className={station.selected ? "selected" : ""}
              key={station.id}
              onClick={clickSelection({ kind: "station", id: station.id }, onSelect)}
              transform={`translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`}
            >
              <circle r={station.selected ? 8 : 5} />
              <text x={9} y={-8}>
                {station.label}
              </text>
              <title>{`${station.label} station candidate: ${station.processName}`}</title>
            </g>
          );
        })}
      </g>

      <g className="semantic-unknown-labels">
        {model.unknownLabels.map((label) => {
          const point = projectPoint(label.position, camera, width, height);
          if (!point.inFrustum) return null;
          return (
            <circle
              className={label.selected ? "selected" : ""}
              key={label.id}
              onClick={clickSelection({ kind: "unknown-text", id: label.id }, onSelect)}
              r={label.selected ? 5 : 3}
              cx={point.x}
              cy={point.y}
            >
              <title>{`Unknown label: ${label.label}`}</title>
            </circle>
          );
        })}
      </g>

      <g className="semantic-source-markers">
        {model.selectedSourceMarkers.map((marker) => {
          const point = projectPoint(marker.position, camera, width, height);
          if (!point.inFrustum) return null;
          return (
            <rect height={8} key={marker.id} width={8} x={point.x - 4} y={point.y - 4}>
              <title>{`Source text: ${marker.label}`}</title>
            </rect>
          );
        })}
      </g>

      {selectedRect ? (
        <rect
          className="semantic-selected-bounds"
          height={selectedRect.height}
          width={selectedRect.width}
          x={selectedRect.x}
          y={selectedRect.y}
        />
      ) : null}
    </svg>
  );
}
