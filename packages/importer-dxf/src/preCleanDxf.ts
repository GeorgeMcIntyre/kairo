export type DxfPreCleanWarning = {
  code: string;
  message: string;
  line?: number;
};

export type DxfPreCleanReport = {
  enabled: boolean;
  removedAcadReactorsCount: number;
  removedAcadReactorsLineRanges: Array<{
    startLine: number;
    endLine: number;
    firstHandle?: string;
  }>;
  appendedMissingEof: boolean;
  originalLineCount: number;
  cleanedLineCount: number;
  warnings: DxfPreCleanWarning[];
};

export type DxfPreCleanResult = {
  text: string;
  report: DxfPreCleanReport;
};

type DxfTag = {
  codeLine: string;
  valueLine?: string;
  code: string;
  value: string;
  originalStartLine: number;
};

const emptyInputWarning: DxfPreCleanWarning = {
  code: "DXF_EMPTY_INPUT",
  message: "DXF input was empty; pre-clean left it unchanged."
};

const lineEndingFor = (input: string) => {
  if (input.includes("\r\n")) {
    return "\r\n";
  }

  if (input.includes("\r")) {
    return "\r";
  }

  return "\n";
};

function splitLines(input: string, newline: string) {
  if (input === "") {
    return [];
  }

  const normalized = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (input.endsWith(newline) && lines.at(-1) === "") {
    lines.pop();
  }

  return lines;
}

function isNumericGroupCode(value: string) {
  return /^-?\d+$/.test(value.trim());
}

function tagsFromLines(lines: string[], warnings: DxfPreCleanWarning[]) {
  const tags: DxfTag[] = [];

  for (let index = 0; index < lines.length; index += 2) {
    const codeLine = lines[index];
    const valueLine = lines[index + 1];
    const startLine = index + 1;
    const code = codeLine.trim();

    if (!isNumericGroupCode(codeLine)) {
      warnings.push({
        code: "DXF_NON_NUMERIC_GROUP_CODE",
        message: "DXF group code line was not numeric; tag was preserved unchanged.",
        line: startLine
      });
    }

    if (valueLine === undefined) {
      warnings.push({
        code: "DXF_UNEVEN_TAG_LINES",
        message: "DXF input ended with a group code line that has no value line; line was preserved unchanged.",
        line: startLine
      });
    }

    tags.push({
      codeLine,
      valueLine,
      code,
      value: valueLine ?? "",
      originalStartLine: startLine
    });
  }

  return tags;
}

function emitTag(lines: string[], tag: DxfTag) {
  lines.push(tag.codeLine);
  if (tag.valueLine !== undefined) {
    lines.push(tag.valueLine);
  }
}

function appendTags(lines: string[], tags: DxfTag[]) {
  for (const tag of tags) {
    emitTag(lines, tag);
  }
}

function endLineForTag(tag: DxfTag) {
  return tag.originalStartLine + (tag.valueLine === undefined ? 0 : 1);
}

function finalNonEmptyTag(tags: DxfTag[]) {
  for (let index = tags.length - 1; index >= 0; index -= 1) {
    const tag = tags[index];
    if (tag.codeLine.trim() !== "" || (tag.valueLine ?? "").trim() !== "") {
      return tag;
    }
  }

  return undefined;
}

export function preCleanDxfText(input: string): DxfPreCleanResult {
  const newline = lineEndingFor(input);
  const lines = splitLines(input, newline);
  const removedAcadReactorsLineRanges: DxfPreCleanReport["removedAcadReactorsLineRanges"] = [];
  const warnings: DxfPreCleanWarning[] = [];

  if (input === "") {
    return {
      text: "",
      report: {
        enabled: true,
        removedAcadReactorsCount: 0,
        removedAcadReactorsLineRanges,
        appendedMissingEof: false,
        originalLineCount: 0,
        cleanedLineCount: 0,
        warnings: [emptyInputWarning]
      }
    };
  }

  const tags = tagsFromLines(lines, warnings);
  const cleanedTags: DxfTag[] = [];

  for (let index = 0; index < tags.length; index += 1) {
    const tag = tags[index];

    if (tag.code === "102" && tag.value.trim() === "{ACAD_REACTORS") {
      const skippedTags: DxfTag[] = [tag];
      let firstHandle: string | undefined;
      let endTag: DxfTag | undefined;

      for (let skipIndex = index + 1; skipIndex < tags.length; skipIndex += 1) {
        const candidate = tags[skipIndex];
        skippedTags.push(candidate);

        if (firstHandle === undefined && candidate.code === "330") {
          firstHandle = candidate.value.trim();
        }

        if (candidate.code === "102" && candidate.value.trim() === "}") {
          endTag = candidate;
          index = skipIndex;
          break;
        }
      }

      if (endTag) {
        const range: DxfPreCleanReport["removedAcadReactorsLineRanges"][number] = {
          startLine: tag.originalStartLine,
          endLine: endLineForTag(endTag)
        };
        if (firstHandle) {
          range.firstHandle = firstHandle;
        }
        removedAcadReactorsLineRanges.push(range);
        continue;
      }

      warnings.push({
        code: "DXF_ACAD_REACTORS_UNCLOSED",
        message: "Found ACAD_REACTORS control group without a closing 102 / } pair; group was left untouched.",
        line: tag.originalStartLine
      });
      cleanedTags.push(...skippedTags);
      break;
    }

    cleanedTags.push(tag);
  }

  let appendedMissingEof = false;
  const finalTag = finalNonEmptyTag(cleanedTags);
  if (!(finalTag?.code === "0" && finalTag.value.trim() === "EOF")) {
    cleanedTags.push({
      codeLine: "0",
      valueLine: "EOF",
      code: "0",
      value: "EOF",
      originalStartLine: lines.length + 1
    });
    appendedMissingEof = true;
  }

  const cleanedLines: string[] = [];
  appendTags(cleanedLines, cleanedTags);

  return {
    text: cleanedLines.join(newline),
    report: {
      enabled: true,
      removedAcadReactorsCount: removedAcadReactorsLineRanges.length,
      removedAcadReactorsLineRanges,
      appendedMissingEof,
      originalLineCount: lines.length,
      cleanedLineCount: cleanedLines.length,
      warnings
    }
  };
}
