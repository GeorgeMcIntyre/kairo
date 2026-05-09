import { describe, expect, it } from "vitest";
import { preCleanDxfText } from "./preCleanDxf";

const lines = (content: string) => preCleanDxfText(content).text.split("\n");

describe("preCleanDxf", () => {
  it("removes ACAD_REACTORS scoped group and preserves the real 330 owner", () => {
    const result = preCleanDxfText(["0", "ATTDEF", "102", "{ACAD_REACTORS", "330", "1035", "102", "}", "330", "1023", "0", "EOF"].join("\n"));

    expect(result.report.removedAcadReactorsCount).toBe(1);
    expect(result.report.removedAcadReactorsLineRanges).toEqual([{ startLine: 3, endLine: 8, firstHandle: "1035" }]);
    expect(result.text).toBe(["0", "ATTDEF", "330", "1023", "0", "EOF"].join("\n"));
  });

  it("does not remove 330 outside ACAD_REACTORS", () => {
    expect(lines(["0", "ATTDEF", "330", "1023", "0", "EOF"].join("\n"))).toEqual(["0", "ATTDEF", "330", "1023", "0", "EOF"]);
  });

  it("does not remove other 102 application control groups", () => {
    const input = [
      "0",
      "ATTDEF",
      "102",
      "{ACAD_XDICTIONARY",
      "330",
      "AAAA",
      "102",
      "}",
      "102",
      "{APP_DEFINED",
      "330",
      "BBBB",
      "102",
      "}",
      "0",
      "EOF"
    ].join("\n");

    const result = preCleanDxfText(input);

    expect(result.report.removedAcadReactorsCount).toBe(0);
    expect(result.text).toBe(input);
  });

  it("preserves entity handle group 5", () => {
    expect(lines(["0", "ATTDEF", "5", "103E", "102", "{ACAD_REACTORS", "330", "1035", "102", "}", "330", "1023", "0", "EOF"].join("\n"))).toEqual([
      "0",
      "ATTDEF",
      "5",
      "103E",
      "330",
      "1023",
      "0",
      "EOF"
    ]);
  });

  it("appends missing EOF when file ends at ENDSEC", () => {
    const result = preCleanDxfText(["0", "SECTION", "0", "ENDSEC"].join("\n"));

    expect(result.report.appendedMissingEof).toBe(true);
    expect(result.text.split("\n").slice(-2)).toEqual(["0", "EOF"]);
  });

  it("does not append EOF when EOF already exists", () => {
    const result = preCleanDxfText(["0", "SECTION", "0", "ENDSEC", "0", "EOF"].join("\n"));

    expect(result.report.appendedMissingEof).toBe(false);
    expect(result.text).toBe(["0", "SECTION", "0", "ENDSEC", "0", "EOF"].join("\n"));
  });

  it("handles multiple ACAD_REACTORS groups", () => {
    const result = preCleanDxfText(
      [
        "0",
        "ATTDEF",
        "102",
        "{ACAD_REACTORS",
        "330",
        "AAAA",
        "102",
        "}",
        "330",
        "1111",
        "102",
        "{ACAD_REACTORS",
        "330",
        "BBBB",
        "102",
        "}",
        "0",
        "EOF"
      ].join("\n")
    );

    expect(result.report.removedAcadReactorsCount).toBe(2);
    expect(result.report.removedAcadReactorsLineRanges).toEqual([
      { startLine: 3, endLine: 8, firstHandle: "AAAA" },
      { startLine: 11, endLine: 16, firstHandle: "BBBB" }
    ]);
    expect(result.text).toBe(["0", "ATTDEF", "330", "1111", "0", "EOF"].join("\n"));
  });

  it("preserves CRLF line endings", () => {
    const result = preCleanDxfText(["0", "ATTDEF", "102", "{ACAD_REACTORS", "330", "1035", "102", "}", "330", "1023", "0", "EOF"].join("\r\n"));

    expect(result.text).toContain("\r\n");
    expect(result.text).not.toContain("ATTDEF\n330");
    expect(result.text).toBe(["0", "ATTDEF", "330", "1023", "0", "EOF"].join("\r\n"));
  });

  it("warns and preserves unclosed ACAD_REACTORS group", () => {
    const input = ["0", "ATTDEF", "102", "{ACAD_REACTORS", "330", "1035", "0", "EOF"].join("\n");
    const result = preCleanDxfText(input);

    expect(result.text).toBe(input);
    expect(result.report.warnings).toEqual([
      {
        code: "DXF_ACAD_REACTORS_UNCLOSED",
        message: "Found ACAD_REACTORS control group without a closing 102 / } pair; group was left untouched.",
        line: 3
      }
    ]);
  });

  it("returns empty text and warning for empty input", () => {
    const result = preCleanDxfText("");

    expect(result.text).toBe("");
    expect(result.report).toMatchObject({
      removedAcadReactorsCount: 0,
      appendedMissingEof: false,
      originalLineCount: 0,
      cleanedLineCount: 0,
      warnings: [
        {
          code: "DXF_EMPTY_INPUT",
          message: "DXF input was empty; pre-clean left it unchanged."
        }
      ]
    });
  });

  it("warns and preserves an uneven trailing group code line", () => {
    const result = preCleanDxfText(["0", "SECTION", "999"].join("\n"));

    expect(result.text).toBe(["0", "SECTION", "999", "0", "EOF"].join("\n"));
    expect(result.report.warnings).toEqual([
      {
        code: "DXF_UNEVEN_TAG_LINES",
        message: "DXF input ended with a group code line that has no value line; line was preserved unchanged.",
        line: 3
      }
    ]);
  });

  it("warns and preserves a nonnumeric group code line", () => {
    const result = preCleanDxfText(["0", "SECTION", "BAD", "VALUE", "0", "EOF"].join("\n"));

    expect(result.text).toBe(["0", "SECTION", "BAD", "VALUE", "0", "EOF"].join("\n"));
    expect(result.report.warnings).toEqual([
      {
        code: "DXF_NON_NUMERIC_GROUP_CODE",
        message: "DXF group code line was not numeric; tag was preserved unchanged.",
        line: 3
      }
    ]);
  });
});
