import { scenePackageSchema, type GeometryDocument, type ScenePackage } from "@kairo/schema";
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

export const kairoPackageFormat = "kairo-package";
export const kairoPackageVersion = "0.1.0";
export const kairoPackageExtension = ".kairo";
export const kairoPackageMimeType = "application/vnd.kairo.package+zip";

export type KairoPackageIndex = {
  format: typeof kairoPackageFormat;
  version: typeof kairoPackageVersion;
  scene: {
    manifest: "manifest.json";
    scene: "scene.json";
    layers: "layers.json";
    materials: "materials.json";
    sourceMap: "source-map.json";
    geometry: string[];
  };
  createdBy?: string;
};

export type CreateKairoPackageOptions = {
  createdBy?: string;
  compressionLevel?: number;
};

export type ReadKairoPackageResult = {
  packageIndex?: KairoPackageIndex;
  scenePackage: ScenePackage;
};

type ZipCompressionLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

const textDecoderMarker = "\uFEFF";

const stableJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const deterministicZipDate = new Date(Date.UTC(1980, 0, 1));

function safeArchivePathPart(value: string, fallback: string) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || fallback;
}

function geometryArchivePath(document: GeometryDocument, index: number) {
  const geometryId = document.geometries[0]?.id;
  return `geometry/${safeArchivePathPart(geometryId ?? "", `geometry-${index}`)}.json`;
}

function jsonEntry(value: unknown) {
  return strToU8(stableJson(value));
}

function compressionLevelFrom(value: number | undefined): ZipCompressionLevel {
  return Math.min(9, Math.max(0, Math.floor(value ?? 6))) as ZipCompressionLevel;
}

function readTextEntry(entries: Record<string, Uint8Array>, entryPath: string): string {
  const bytes = entries[entryPath];
  if (!bytes) {
    throw Object.assign(new Error(`Kairo package is missing ${entryPath}.`), {
      code: "KAIRO_PACKAGE_MISSING_ENTRY",
      path: entryPath
    });
  }
  const text = strFromU8(bytes);
  return text.startsWith(textDecoderMarker) ? text.slice(1) : text;
}

function readJsonEntry<T>(entries: Record<string, Uint8Array>, entryPath: string): T {
  return JSON.parse(readTextEntry(entries, entryPath)) as T;
}

function defaultGeometryPaths(entries: Record<string, Uint8Array>) {
  return Object.keys(entries)
    .filter((entryPath) => /^geometry\/[^/]+\.json$/i.test(entryPath))
    .sort((a, b) => a.localeCompare(b));
}

export function createKairoPackage(scenePackage: ScenePackage, options: CreateKairoPackageOptions = {}): Uint8Array {
  const parsedScenePackage = scenePackageSchema.parse(scenePackage);
  const geometryPaths = parsedScenePackage.geometry.map(geometryArchivePath);
  const packageIndex: KairoPackageIndex = {
    format: kairoPackageFormat,
    version: kairoPackageVersion,
    scene: {
      manifest: "manifest.json",
      scene: "scene.json",
      layers: "layers.json",
      materials: "materials.json",
      sourceMap: "source-map.json",
      geometry: geometryPaths
    },
    createdBy: options.createdBy
  };

  const files: Zippable = {
    "kairo-package.json": jsonEntry(packageIndex),
    "manifest.json": jsonEntry(parsedScenePackage.manifest),
    "scene.json": jsonEntry(parsedScenePackage.scene),
    "layers.json": jsonEntry(parsedScenePackage.layers),
    "materials.json": jsonEntry(parsedScenePackage.materials),
    "source-map.json": jsonEntry(parsedScenePackage.sourceMap)
  };

  parsedScenePackage.geometry.forEach((document, index) => {
    files[geometryPaths[index]] = jsonEntry(document);
  });

  return zipSync(files, {
    level: compressionLevelFrom(options.compressionLevel),
    mtime: deterministicZipDate
  });
}

export function readKairoPackage(bytes: Uint8Array): ReadKairoPackageResult {
  const entries = unzipSync(bytes);
  const packageIndex = entries["kairo-package.json"]
    ? readJsonEntry<KairoPackageIndex>(entries, "kairo-package.json")
    : undefined;

  if (packageIndex && (packageIndex.format !== kairoPackageFormat || packageIndex.version !== kairoPackageVersion)) {
    throw Object.assign(
      new Error(`Unsupported Kairo package format/version: ${packageIndex.format} ${packageIndex.version}.`),
      { code: "KAIRO_PACKAGE_UNSUPPORTED_VERSION" }
    );
  }

  const geometryPaths = packageIndex?.scene.geometry.length
    ? packageIndex.scene.geometry
    : defaultGeometryPaths(entries);
  if (geometryPaths.length === 0) {
    throw Object.assign(new Error("Kairo package does not contain geometry/*.json entries."), {
      code: "KAIRO_PACKAGE_MISSING_GEOMETRY"
    });
  }

  const scenePackage = scenePackageSchema.parse({
    manifest: readJsonEntry<unknown>(entries, packageIndex?.scene.manifest ?? "manifest.json"),
    scene: readJsonEntry<unknown>(entries, packageIndex?.scene.scene ?? "scene.json"),
    geometry: geometryPaths.map((entryPath) => readJsonEntry<unknown>(entries, entryPath)),
    layers: readJsonEntry<unknown>(entries, packageIndex?.scene.layers ?? "layers.json"),
    materials: readJsonEntry<unknown>(entries, packageIndex?.scene.materials ?? "materials.json"),
    sourceMap: readJsonEntry<unknown>(entries, packageIndex?.scene.sourceMap ?? "source-map.json")
  });

  return {
    packageIndex,
    scenePackage
  };
}
