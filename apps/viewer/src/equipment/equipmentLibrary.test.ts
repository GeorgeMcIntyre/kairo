import { describe, expect, it } from "vitest";
import {
  KAIRO_EQUIPMENT_LIBRARY,
  equipmentLibraryByTypeId,
  findEquipmentForDeviceKind
} from "./equipmentLibrary";

describe("Kairo equipment library", () => {
  it("contains the first MVP equipment templates with footprint, clearance, and padding metadata", () => {
    expect(KAIRO_EQUIPMENT_LIBRARY.map((item) => item.equipmentTypeId)).toEqual([
      "robot.generic",
      "dunnage.station",
      "nest.station",
      "panel.electrical",
      "fence.panel"
    ]);

    for (const item of KAIRO_EQUIPMENT_LIBRARY) {
      expect(item.footprint.widthMm).toBeGreaterThan(0);
      expect(item.footprint.depthMm).toBeGreaterThan(0);
      expect(item.clearance.reason).not.toBe("");
      expect(item.defaultPaddingMm).toBeGreaterThanOrEqual(0);
    }
  });

  it("maps protected and generic semantic device kinds to reusable equipment types", () => {
    expect(findEquipmentForDeviceKind("robot")?.item.equipmentTypeId).toBe("robot.generic");
    expect(findEquipmentForDeviceKind("device_number")?.item.equipmentTypeId).toBe("robot.generic");
    expect(findEquipmentForDeviceKind("dunnage")?.item.equipmentTypeId).toBe("dunnage.station");
    expect(findEquipmentForDeviceKind("nest")?.item.equipmentTypeId).toBe("nest.station");
    expect(findEquipmentForDeviceKind("pdp_panel")?.item.equipmentTypeId).toBe("panel.electrical");
    expect(findEquipmentForDeviceKind("robot_controller")?.item.equipmentTypeId).toBe("panel.electrical");
    expect(findEquipmentForDeviceKind("fence")?.item.equipmentTypeId).toBe("fence.panel");
  });

  it("leaves unsupported device kinds unmapped for review instead of guessing", () => {
    expect(findEquipmentForDeviceKind("service_drop")).toBeUndefined();
    expect(findEquipmentForDeviceKind("station_device_tag")).toBeUndefined();
  });

  it("builds a deterministic lookup by equipment type id", () => {
    const byTypeId = equipmentLibraryByTypeId();

    expect([...byTypeId.keys()]).toEqual(KAIRO_EQUIPMENT_LIBRARY.map((item) => item.equipmentTypeId));
    expect(byTypeId.get("robot.generic")).toMatchObject({
      defaultBomCategory: "robot",
      footprint: { widthMm: 2500, depthMm: 2500 }
    });
  });
});
