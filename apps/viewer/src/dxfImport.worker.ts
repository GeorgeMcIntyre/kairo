import { importDxfTextToKairo, type DxfImportResult } from "@kairo/importer-dxf/browser";

type DxfImportWorkerRequest = {
  id: number;
  fileName: string;
  text: string;
};

type DxfImportWorkerSuccess = {
  id: number;
  ok: true;
  result: DxfImportResult;
};

type DxfImportWorkerFailure = {
  id: number;
  ok: false;
  error: {
    message: string;
    name?: string;
    stack?: string;
  };
};

export type DxfImportWorkerResponse = DxfImportWorkerSuccess | DxfImportWorkerFailure;

self.onmessage = (event: MessageEvent<DxfImportWorkerRequest>) => {
  const { id, fileName, text } = event.data;

  void importDxfTextToKairo(fileName, text, { createdBy: "kairo viewer upload" })
    .then((result) => {
      self.postMessage({ id, ok: true, result } satisfies DxfImportWorkerSuccess);
    })
    .catch((error: unknown) => {
      self.postMessage({
        id,
        ok: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : undefined,
          stack: error instanceof Error ? error.stack : undefined
        }
      } satisfies DxfImportWorkerFailure);
    });
};
