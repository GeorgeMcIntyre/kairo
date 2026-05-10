import { describe, expect, it } from "vitest";
import { extractDirectMtextEntities, stripMtextFormatting } from "./extractMtext";

describe("stripMtextFormatting", () => {
  it("turns \\P paragraph break into a newline", () => {
    expect(stripMtextFormatting("7B-070R\\PRACK LOAD")).toBe("7B-070R\nRACK LOAD");
  });

  it("strips parameterised \\f \\C \\H \\W \\Q codes", () => {
    expect(stripMtextFormatting("\\fArial|b0|i0;hello")).toBe("hello");
    expect(stripMtextFormatting("\\C5;blue text")).toBe("blue text");
    expect(stripMtextFormatting("\\H1.5x;big")).toBe("big");
    expect(stripMtextFormatting("\\W0.8;narrow")).toBe("narrow");
    expect(stripMtextFormatting("\\Q15;slant")).toBe("slant");
  });

  it("strips parameterless toggles \\L \\O \\K and lowercase variants", () => {
    expect(stripMtextFormatting("\\Lunder\\l done")).toBe("under done");
    expect(stripMtextFormatting("\\Oover\\o done")).toBe("over done");
    expect(stripMtextFormatting("\\Kstrike\\k done")).toBe("strike done");
  });

  it("removes grouping braces but keeps content", () => {
    expect(stripMtextFormatting("{simple}")).toBe("simple");
    expect(stripMtextFormatting("{\\C5;red}{green}")).toBe("redgreen");
  });

  it("preserves literal escapes", () => {
    expect(stripMtextFormatting("path\\\\file")).toBe("path\\file");
    expect(stripMtextFormatting("a\\{b\\}c")).toBe("a{b}c");
  });

  it("decodes \\U+XXXX unicode escapes", () => {
    expect(stripMtextFormatting("\\U+00B0")).toBe("°");
    expect(stripMtextFormatting("90\\U+00B0 angle")).toBe("90° angle");
  });

  it("converts \\X column break to newline and \\~ to space", () => {
    expect(stripMtextFormatting("a\\Xb")).toBe("a\nb");
    expect(stripMtextFormatting("a\\~b")).toBe("a b");
  });

  it("handles empty/null input", () => {
    expect(stripMtextFormatting("")).toBe("");
  });

  it("strips paragraph indent codes \\pt1371.6;", () => {
    expect(stripMtextFormatting("\\pt1371.6;7B-070R\\PRACK LOAD")).toBe("7B-070R\nRACK LOAD");
  });

  it("renders stacked text \\S in flat form", () => {
    // \\S<over>^<under>; — caret separator is replaced with /
    expect(stripMtextFormatting("\\S1^2;")).toBe("1/2");
    expect(stripMtextFormatting("\\S3#4;")).toBe("3/4");
  });
});

describe("extractDirectMtextEntities", () => {
  const buildDxf = (entities: string[]) =>
    [
      "  0", "SECTION",
      "  2", "ENTITIES",
      ...entities,
      "  0", "ENDSEC",
      "  0", "EOF"
    ].join("\n");

  it("returns no records when ENTITIES section is absent", () => {
    const dxf = ["  0", "SECTION", "  2", "HEADER", "  0", "ENDSEC", "  0", "EOF"].join("\n");
    expect(extractDirectMtextEntities(dxf)).toEqual([]);
  });

  it("extracts a single MTEXT record with all key fields", () => {
    const dxf = buildDxf([
      "  0", "MTEXT",
      "  5", "17077",
      "  8", "0-A-ANNOT-T",
      " 10", "108225.159",
      " 20", "94541.196",
      " 30", "5.0",
      " 40", "457.2",
      " 50", "0",
      " 71", "5",
      "  1", "\\pt1371.6;7B-070R\\PRACK LOAD"
    ]);

    const records = extractDirectMtextEntities(dxf);
    expect(records).toHaveLength(1);
    const [record] = records;
    expect(record.handle).toBe("17077");
    expect(record.layerName).toBe("0-A-ANNOT-T");
    expect(record.insertion[0]).toBeCloseTo(108225.159, 3);
    expect(record.insertion[1]).toBeCloseTo(94541.196, 3);
    expect(record.insertion[2]).toBeCloseTo(5.0, 3);
    expect(record.height).toBeCloseTo(457.2, 3);
    expect(record.rotationDeg).toBe(0);
    expect(record.attachmentPoint).toBe(5);
    expect(record.text).toBe("7B-070R\nRACK LOAD");
  });

  it("concatenates group 3 chunks before the final group 1", () => {
    const dxf = buildDxf([
      "  0", "MTEXT",
      "  5", "ABC",
      " 10", "0",
      " 20", "0",
      " 30", "0",
      " 40", "10",
      "  3", "Hello ",
      "  3", "long ",
      "  1", "world"
    ]);
    const [record] = extractDirectMtextEntities(dxf);
    expect(record.text).toBe("Hello long world");
  });

  it("skips MTEXT records whose stripped text is empty", () => {
    const dxf = buildDxf([
      "  0", "MTEXT",
      "  5", "ABC",
      " 40", "10",
      "  1", "{\\f;}"
    ]);
    expect(extractDirectMtextEntities(dxf)).toEqual([]);
  });

  it("handles multiple MTEXT records in a row", () => {
    const dxf = buildDxf([
      "  0", "MTEXT",
      "  5", "A",
      " 10", "1",
      " 20", "2",
      " 40", "5",
      "  1", "first",
      "  0", "MTEXT",
      "  5", "B",
      " 10", "3",
      " 20", "4",
      " 40", "10",
      " 50", "90",
      "  1", "second"
    ]);
    const records = extractDirectMtextEntities(dxf);
    expect(records).toHaveLength(2);
    expect(records[0].text).toBe("first");
    expect(records[0].handle).toBe("A");
    expect(records[1].text).toBe("second");
    expect(records[1].rotationDeg).toBe(90);
  });

  it("ignores non-MTEXT entities mixed in", () => {
    const dxf = buildDxf([
      "  0", "LINE",
      "  5", "L1",
      " 10", "0",
      "  0", "MTEXT",
      "  5", "M1",
      " 40", "10",
      "  1", "kept",
      "  0", "CIRCLE",
      "  5", "C1"
    ]);
    const records = extractDirectMtextEntities(dxf);
    expect(records).toHaveLength(1);
    expect(records[0].text).toBe("kept");
  });
});
