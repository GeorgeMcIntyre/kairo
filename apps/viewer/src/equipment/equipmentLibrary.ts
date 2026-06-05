import type { DeviceKind } from "../semantic/deviceDictionary";

export type EquipmentBomCategory = "robot" | "dunnage" | "nest" | "panel" | "fence" | "tooling" | "unknown";

export type FootprintSpec = {
  source: "geometry-bounds" | "library-default" | "manual";
  widthMm: number;
  depthMm: number;
  rotationDeg?: number;
};

export type ClearanceSpec = {
  frontMm: number;
  rearMm: number;
  leftMm: number;
  rightMm: number;
  heightMm?: number;
  reason: string;
};

export type EquipmentLibraryItem = {
  equipmentTypeId: string;
  displayName: string;
  deviceKinds: DeviceKind[];
  defaultBomCategory: EquipmentBomCategory;
  footprint: FootprintSpec;
  clearance: ClearanceSpec;
  defaultPaddingMm: number;
  metadata: {
    vendor?: string;
    model?: string;
    requiresReview?: boolean;
  };
};

export type EquipmentLibraryMatch = {
  item: EquipmentLibraryItem;
  confidence: number;
  reason: string[];
  requiresReview: boolean;
};

export const KAIRO_EQUIPMENT_LIBRARY: readonly EquipmentLibraryItem[] = [
  {
    equipmentTypeId: "robot.generic",
    displayName: "Generic industrial robot",
    deviceKinds: ["robot", "robot_model", "device_number"],
    defaultBomCategory: "robot",
    footprint: {
      source: "geometry-bounds",
      widthMm: 2500,
      depthMm: 2500
    },
    clearance: {
      frontMm: 1000,
      rearMm: 1000,
      leftMm: 1000,
      rightMm: 1000,
      reason: "generic robot service and reach review allowance"
    },
    defaultPaddingMm: 250,
    metadata: {
      requiresReview: true
    }
  },
  {
    equipmentTypeId: "dunnage.station",
    displayName: "Dunnage station",
    deviceKinds: ["dunnage"],
    defaultBomCategory: "dunnage",
    footprint: {
      source: "geometry-bounds",
      widthMm: 1800,
      depthMm: 1200
    },
    clearance: {
      frontMm: 750,
      rearMm: 500,
      leftMm: 500,
      rightMm: 500,
      reason: "generic dunnage load/unload access allowance"
    },
    defaultPaddingMm: 150,
    metadata: {
      requiresReview: true
    }
  },
  {
    equipmentTypeId: "nest.station",
    displayName: "Nest station",
    deviceKinds: ["nest"],
    defaultBomCategory: "nest",
    footprint: {
      source: "geometry-bounds",
      widthMm: 1500,
      depthMm: 1200
    },
    clearance: {
      frontMm: 750,
      rearMm: 500,
      leftMm: 500,
      rightMm: 500,
      reason: "generic nest load/access allowance"
    },
    defaultPaddingMm: 150,
    metadata: {
      requiresReview: true
    }
  },
  {
    equipmentTypeId: "panel.electrical",
    displayName: "Electrical panel",
    deviceKinds: ["pdp_panel", "robot_controller"],
    defaultBomCategory: "panel",
    footprint: {
      source: "geometry-bounds",
      widthMm: 900,
      depthMm: 400
    },
    clearance: {
      frontMm: 1000,
      rearMm: 300,
      leftMm: 300,
      rightMm: 300,
      reason: "generic electrical panel front access allowance"
    },
    defaultPaddingMm: 100,
    metadata: {
      requiresReview: true
    }
  },
  {
    equipmentTypeId: "fence.panel",
    displayName: "Fence panel",
    deviceKinds: ["fence"],
    defaultBomCategory: "fence",
    footprint: {
      source: "geometry-bounds",
      widthMm: 1000,
      depthMm: 80
    },
    clearance: {
      frontMm: 100,
      rearMm: 100,
      leftMm: 100,
      rightMm: 100,
      reason: "minimal fence review padding"
    },
    defaultPaddingMm: 100,
    metadata: {
      requiresReview: true
    }
  }
];

function specificity(item: EquipmentLibraryItem): number {
  return item.deviceKinds.length === 1 ? 2 : 1;
}

export function findEquipmentForDeviceKind(kind: DeviceKind): EquipmentLibraryMatch | undefined {
  const matches = KAIRO_EQUIPMENT_LIBRARY.filter((item) => item.deviceKinds.includes(kind)).sort(
    (left, right) =>
      specificity(right) - specificity(left) ||
      left.equipmentTypeId.localeCompare(right.equipmentTypeId)
  );
  const item = matches[0];
  if (!item) return undefined;

  return {
    item,
    confidence: specificity(item) === 2 ? 0.92 : 0.82,
    reason: [`device kind ${kind} maps to ${item.equipmentTypeId}`],
    requiresReview: item.metadata.requiresReview === true || matches.length > 1
  };
}

export function equipmentLibraryByTypeId(
  items: readonly EquipmentLibraryItem[] = KAIRO_EQUIPMENT_LIBRARY
): Map<string, EquipmentLibraryItem> {
  return new Map(items.map((item) => [item.equipmentTypeId, item]));
}
