import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeDxfBlocks } from "./analyzeDxfBlocks";

const dxf = (lines: string[]) => `${lines.join("\n")}\n`;

const layerTable = ["0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", "1", "0", "LAYER", "2", "CUT", "70", "0", "62", "7", "6", "CONTINUOUS", "0", "ENDTAB", "0", "ENDSEC"];
const blockHeader = (name: string) => [
  "0",
  "BLOCK",
  "5",
  `${name}-B`,
  "100",
  "AcDbEntity",
  "8",
  "0",
  "100",
  "AcDbBlockBegin",
  "2",
  name,
  "70",
  "0",
  "10",
  "0",
  "20",
  "0",
  "30",
  "0",
  "3",
  name,
  "1",
  ""
];
const blockFooter = ["0", "ENDBLK", "5", "EB1", "100", "AcDbEntity", "8", "0", "100", "AcDbBlockEnd"];
const lineEntity = (handle: string, layerName = "0") => [
  "0",
  "LINE",
  "5",
  handle,
  "100",
  "AcDbEntity",
  "8",
  layerName,
  "100",
  "AcDbLine",
  "10",
  "0",
  "20",
  "0",
  "30",
  "0",
  "11",
  "1",
  "21",
  "0",
  "31",
  "0"
];
const textEntity = ["0", "TEXT", "5", "T1", "100", "AcDbEntity", "8", "0", "100", "AcDbText", "10", "0", "20", "0", "30", "0", "40", "1", "1", "LABEL"];
const insertEntity = (blockName: string, handle: string, extras: string[] = []) => [
  "0",
  "INSERT",
  "5",
  handle,
  "100",
  "AcDbEntity",
  "8",
  "CUT",
  "100",
  "AcDbBlockReference",
  "2",
  blockName,
  "10",
  "5",
  "20",
  "6",
  "30",
  "0",
  ...extras
];

async function withDxf(content: string, test: (filePath: string) => Promise<void>) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "kairo-dxf-block-analysis-"));
  try {
    const filePath = path.join(tempDir, "input.dxf");
    await writeFile(filePath, content);
    await test(filePath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function scene(blockLines: string[], entityLines: string[]) {
  return dxf([
    ...layerTable,
    "0",
    "SECTION",
    "2",
    "BLOCKS",
    ...blockLines,
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "ENTITIES",
    ...entityLines,
    "0",
    "ENDSEC",
    "0",
    "EOF"
  ]);
}

describe("analyzeDxfBlocks", () => {
  it("reports one BLOCK and one safe INSERT", async () => {
    await withDxf(scene([...blockHeader("SIMPLE"), ...lineEntity("L1"), ...blockFooter], insertEntity("SIMPLE", "I1")), async (filePath) => {
      const inventory = await analyzeDxfBlocks(filePath);

      expect(inventory.parser.ok).toBe(true);
      expect(inventory.totalInsertCount).toBe(1);
      expect(inventory.uniqueInsertBlockNameCount).toBe(1);
      expect(inventory.blockDefinitionCount).toBe(1);
      expect(inventory.missingBlockDefinitions).toEqual([]);
      expect(inventory.safeExpansionClassificationCounts["safe now"]).toBe(1);
      expect(inventory.topInsertedBlockNames[0]).toMatchObject({
        blockName: "SIMPLE",
        insertCount: 1,
        layerNames: ["CUT"],
        blockDefinitionEntityTypeCounts: {
          LINE: 1
        }
      });
    });
  });

  it("reports missing block definitions", async () => {
    await withDxf(scene([], insertEntity("MISSING", "I1")), async (filePath) => {
      const inventory = await analyzeDxfBlocks(filePath);

      expect(inventory.totalInsertCount).toBe(1);
      expect(inventory.missingBlockDefinitions).toEqual(["MISSING"]);
      expect(inventory.safeExpansionClassificationCounts["missing block definition"]).toBe(1);
    });
  });

  it("records nested INSERTs inside block definitions without treating them as blocked", async () => {
    const block = [...blockHeader("NESTED"), ...insertEntity("CHILD", "BI1"), ...blockFooter];
    await withDxf(scene(block, insertEntity("NESTED", "I1")), async (filePath) => {
      const inventory = await analyzeDxfBlocks(filePath);

      expect(inventory.nestedInsertCountInsideBlocks).toBe(1);
      expect(inventory.blockDefinitionsByName.NESTED).toMatchObject({
        hasNestedInsert: true,
        classification: "safe now"
      });
      expect(inventory.safeExpansionClassificationCounts["safe now"]).toBe(1);
    });
  });

  it("classifies covered text child entity types as safe now", async () => {
    await withDxf(scene([...blockHeader("TEXTBLOCK"), ...textEntity, ...blockFooter], insertEntity("TEXTBLOCK", "I1")), async (filePath) => {
      const inventory = await analyzeDxfBlocks(filePath);

      expect(inventory.blockDefinitionsByName.TEXTBLOCK).toMatchObject({
        hasAttdefAttribTextMtext: true,
        hasUnsupportedEntityTypes: false,
        classification: "safe now"
      });
      expect(inventory.safeExpansionClassificationCounts["safe now"]).toBe(1);
    });
  });

  it("allows rotation but classifies non-uniform scale as transform complexity", async () => {
    await withDxf(
      scene([...blockHeader("TRANSFORMED"), ...lineEntity("L1"), ...blockFooter], insertEntity("TRANSFORMED", "I1", ["41", "2", "42", "3", "43", "2", "50", "45"])),
      async (filePath) => {
        const inventory = await analyzeDxfBlocks(filePath);

        expect(inventory.safeExpansionClassificationCounts["blocked by transform complexity"]).toBe(1);
        expect(inventory.topInsertedBlockNames[0].transformComplexity).toEqual({
          nonUniformScale: 1,
          negativeScale: 0,
          rotation: 1,
          zOffset: 0
        });
      }
    );
  });

  it("classifies rotated otherwise-safe blocks as safe now", async () => {
    await withDxf(scene([...blockHeader("ROTATED"), ...lineEntity("L1"), ...blockFooter], insertEntity("ROTATED", "I1", ["50", "45"])), async (filePath) => {
      const inventory = await analyzeDxfBlocks(filePath);

      expect(inventory.safeExpansionClassificationCounts["safe now"]).toBe(1);
      expect(inventory.topInsertedBlockNames[0].transformComplexity).toEqual({
        nonUniformScale: 0,
        negativeScale: 0,
        rotation: 1,
        zOffset: 0
      });
    });
  });

  it("textAudit counts TEXT entities in block definitions", async () => {
    const attdef = ["0", "ATTDEF", "5", "AD1", "100", "AcDbEntity", "8", "0", "100", "AcDbText", "10", "0", "20", "0", "30", "0", "40", "1", "1", "DEFAULT", "100", "AcDbAttributeDefinition", "70", "0", "2", "TAG1", "3", "Prompt1"];
    const content = scene(
      [...blockHeader("LABELED"), ...textEntity, ...attdef, ...lineEntity("L1"), ...blockFooter],
      insertEntity("LABELED", "I1")
    );
    await withDxf(content, async (filePath) => {
      const inventory = await analyzeDxfBlocks(filePath);

      expect(inventory.textAudit.totalTextCount).toBe(1);
      expect(inventory.textAudit.totalAttdefCount).toBe(1);
      expect(inventory.textAudit.inBlockDefinitions.TEXT).toBe(1);
      expect(inventory.textAudit.inBlockDefinitions.ATTDEF).toBe(1);
      expect(inventory.textAudit.inDirectEntities.TEXT).toBe(0);
      expect(inventory.textAudit.topTextBlocks).toHaveLength(1);
      expect(inventory.textAudit.topTextBlocks[0]).toMatchObject({
        blockName: "LABELED",
        usageCount: 1,
        textCount: 1,
        attdefCount: 1
      });
      expect(inventory.textAudit.sampleTextStrings.length).toBeGreaterThan(0);
      expect(inventory.textAudit.sampleTextStrings[0].source).toContain("LABELED");
      expect(inventory.textAudit.partialExpandTextSkipped).toHaveLength(0);
    });
  });

  it("textAudit detects equipment block name patterns", async () => {
    const content = scene(
      [...blockHeader("FANUC_ROBOT_ARM"), ...lineEntity("L1"), ...blockFooter],
      insertEntity("FANUC_ROBOT_ARM", "I1")
    );
    await withDxf(content, async (filePath) => {
      const inventory = await analyzeDxfBlocks(filePath);

      expect(inventory.textAudit.equipmentBlockMatches).toHaveLength(1);
      expect(inventory.textAudit.equipmentBlockMatches[0].blockName).toBe("FANUC_ROBOT_ARM");
      expect(inventory.textAudit.equipmentBlockMatches[0].matchedPattern).toBe("FANUC");
      expect(inventory.textAudit.equipmentBlockMatches[0].insertCount).toBe(1);
    });
  });

  it("transformAudit treats pure negative uniform inserts as covered mirror transforms", async () => {
    const content = scene(
      [...blockHeader("NEGBLOCK"), ...lineEntity("L1"), ...blockFooter],
      insertEntity("NEGBLOCK", "I1", ["41", "-1", "42", "-1", "43", "-1"])
    );
    await withDxf(content, async (filePath) => {
      const inventory = await analyzeDxfBlocks(filePath);

      expect(inventory.transformAudit.totalHardBlocked).toBe(0);
      expect(inventory.transformAudit.flagCounts.negativeX).toBe(0);
      expect(inventory.transformAudit.flagCounts.negativeY).toBe(0);
      expect(inventory.transformAudit.flagCounts.negativeZ).toBe(0);
      expect(inventory.transformAudit.flagCounts.nonUniform).toBe(0);
      expect(inventory.transformAudit.categoryCounts.pureNegativeUniform).toBe(0);
      expect(inventory.transformAudit.categoryCounts.pureNonUniformPositive).toBe(0);
      expect(inventory.transformAudit.optionUnlocks.optionA).toBe(0);
      expect(inventory.transformAudit.optionUnlocks.optionB).toBe(0);
      expect(inventory.transformAudit.topBlockedBlocks).toHaveLength(0);
    });
  });

  it("transformAudit counts pure non-uniform positive inserts", async () => {
    const content = scene(
      [...blockHeader("NUPBLOCK"), ...lineEntity("L1"), ...blockFooter],
      insertEntity("NUPBLOCK", "I1", ["41", "2", "42", "3", "43", "1"])
    );
    await withDxf(content, async (filePath) => {
      const inventory = await analyzeDxfBlocks(filePath);

      expect(inventory.transformAudit.totalHardBlocked).toBe(1);
      expect(inventory.transformAudit.flagCounts.negativeX).toBe(0);
      expect(inventory.transformAudit.flagCounts.nonUniform).toBe(1);
      expect(inventory.transformAudit.categoryCounts.pureNonUniformPositive).toBe(1);
      expect(inventory.transformAudit.categoryCounts.pureNegativeUniform).toBe(0);
      expect(inventory.transformAudit.optionUnlocks.optionA).toBe(0);
      expect(inventory.transformAudit.optionUnlocks.optionB).toBe(1);
      expect(inventory.transformAudit.topBlockedBlocks[0]).toMatchObject({ blockName: "NUPBLOCK", category: "pureNonUniformPositive" });
    });
  });

  it("transformAudit counts non-uniform negative inserts", async () => {
    const content = scene(
      [...blockHeader("MIXBLOCK"), ...lineEntity("L1"), ...blockFooter],
      insertEntity("MIXBLOCK", "I1", ["41", "2", "42", "-3", "43", "1"])
    );
    await withDxf(content, async (filePath) => {
      const inventory = await analyzeDxfBlocks(filePath);

      expect(inventory.transformAudit.totalHardBlocked).toBe(1);
      expect(inventory.transformAudit.flagCounts.negativeY).toBe(1);
      expect(inventory.transformAudit.flagCounts.nonUniform).toBe(1);
      expect(inventory.transformAudit.categoryCounts.nonUniformNegative).toBe(1);
      expect(inventory.transformAudit.optionUnlocks.optionA).toBe(0);
      expect(inventory.transformAudit.optionUnlocks.optionB).toBe(0);
    });
  });

  it("transformAudit ignores z-offset-only inserts (not a hard failure)", async () => {
    const content = scene(
      [...blockHeader("ZBLOCK"), ...lineEntity("L1"), ...blockFooter],
      insertEntity("ZBLOCK", "I1", ["30", "5"])
    );
    await withDxf(content, async (filePath) => {
      const inventory = await analyzeDxfBlocks(filePath);

      expect(inventory.transformAudit.totalHardBlocked).toBe(0);
      expect(inventory.transformAudit.topBlockedBlocks).toHaveLength(0);
    });
  });

  it("transformAudit ignores z-offset also present on covered mirror transforms", async () => {
    const content = scene(
      [...blockHeader("ZNEG"), ...lineEntity("L1"), ...blockFooter],
      insertEntity("ZNEG", "I1", ["30", "5", "41", "-1", "42", "-1", "43", "-1"])
    );
    await withDxf(content, async (filePath) => {
      const inventory = await analyzeDxfBlocks(filePath);

      expect(inventory.transformAudit.totalHardBlocked).toBe(0);
      expect(inventory.transformAudit.flagCounts.zOffsetAlso).toBe(0);
      expect(inventory.transformAudit.categoryCounts.pureNegativeUniform).toBe(0);
    });
  });

  it("transformAudit does not block equipment blocks for covered mirror transforms", async () => {
    const content = scene(
      [...blockHeader("FANUC_ARM"), ...lineEntity("L1"), ...blockFooter],
      insertEntity("FANUC_ARM", "I1", ["41", "-1", "42", "-1", "43", "-1"])
    );
    await withDxf(content, async (filePath) => {
      const inventory = await analyzeDxfBlocks(filePath);

      expect(inventory.transformAudit.blockedEquipmentBlocks).toHaveLength(0);
    });
  });

  it("transformAudit empty when all inserts have clean transforms", async () => {
    await withDxf(scene([...blockHeader("SIMPLE"), ...lineEntity("L1"), ...blockFooter], insertEntity("SIMPLE", "I1")), async (filePath) => {
      const inventory = await analyzeDxfBlocks(filePath);

      expect(inventory.transformAudit.totalHardBlocked).toBe(0);
      expect(inventory.transformAudit.topBlockedBlocks).toHaveLength(0);
      expect(inventory.transformAudit.blockedEquipmentBlocks).toHaveLength(0);
      expect(inventory.transformAudit.optionUnlocks).toEqual({ optionA: 0, optionB: 0, optionC: 0 });
    });
  });

  it("textAudit empty when no text entities exist", async () => {
    await withDxf(scene([...blockHeader("SIMPLE"), ...lineEntity("L1"), ...blockFooter], insertEntity("SIMPLE", "I1")), async (filePath) => {
      const inventory = await analyzeDxfBlocks(filePath);

      expect(inventory.textAudit.totalTextCount).toBe(0);
      expect(inventory.textAudit.totalAttdefCount).toBe(0);
      expect(inventory.textAudit.topTextBlocks).toHaveLength(0);
      expect(inventory.textAudit.equipmentBlockMatches).toHaveLength(0);
      expect(inventory.textAudit.partialExpandTextSkipped).toHaveLength(0);
    });
  });
});
