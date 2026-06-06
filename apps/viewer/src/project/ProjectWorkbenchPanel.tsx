import { useMemo, useState } from "react";
import { DEVICE_KINDS, type DeviceKind } from "@kairo/semantic";
import type { LayoutValidationIssue } from "../layoutValidation/layoutRules";
import type { LayoutPackage, ReviewStatus } from "../layoutLibrary/layoutPackage";
import type { LayoutReviewPack } from "../layoutLibrary/layoutReviewPack";
import type { ReviewedLayoutLibraryPackage } from "../layoutLibrary/reviewedLayoutLibrary";

type ExportFormat = "json" | "csv" | "markdown";
type DocumentFormat = "json" | "markdown";

export type ProjectWorkbenchPanelProps = {
  layoutPackage: LayoutPackage;
  activeReviewPack: LayoutReviewPack;
  reviewedLibrary: ReviewedLayoutLibraryPackage;
  validationIssues: LayoutValidationIssue[];
  isEditingLive: boolean;
  statusMessage?: string;
  onClose: () => void;
  onBuildProject: () => void;
  onExportProjectJson: () => void;
  onImportProjectJson: () => void;
  onExportReviewArtifact: () => void;
  onImportReviewArtifact: () => void;
  onExportSemanticSummary: (format: DocumentFormat) => void;
  onExportQaReport: (format: DocumentFormat) => void;
  onExportAdvancedLayout: (format: ExportFormat) => void;
  onExportLayoutLibrary: (format: ExportFormat) => void;
  onExportReviewTemplate: () => void;
  onImportReviewPack: () => void;
  onExportTrainingTruth: (format: ExportFormat) => void;
  onImportTrainingTruth: () => void;
  onExportTrainingTruthComparison: (format: ExportFormat) => void;
  onExportReviewedLibrary: (format: ExportFormat) => void;
  onRecordStatusChange: (recordId: string, status: ReviewStatus) => void;
  onRecordTypeCorrection: (recordId: string, correctedType: DeviceKind) => void;
};

function deviceKindLabel(kind: DeviceKind): string {
  return kind.replace(/_/g, " ");
}

function geometryStatusLabel(status: string): string {
  if (status === "linked") return "linked";
  if (status === "ambiguous") return "ambiguous";
  return "unlinked";
}

function reviewStatusLabel(status: ReviewStatus): string {
  return status;
}

export function ProjectWorkbenchPanel({
  layoutPackage,
  activeReviewPack,
  reviewedLibrary,
  validationIssues,
  isEditingLive,
  statusMessage,
  onClose,
  onBuildProject,
  onExportProjectJson,
  onImportProjectJson,
  onExportReviewArtifact,
  onImportReviewArtifact,
  onExportSemanticSummary,
  onExportQaReport,
  onExportAdvancedLayout,
  onExportLayoutLibrary,
  onExportReviewTemplate,
  onImportReviewPack,
  onExportTrainingTruth,
  onImportTrainingTruth,
  onExportTrainingTruthComparison,
  onExportReviewedLibrary,
  onRecordStatusChange,
  onRecordTypeCorrection
}: ProjectWorkbenchPanelProps) {
  const [correctingRecordId, setCorrectingRecordId] = useState<string | undefined>();

  const classificationByDeviceId = useMemo(
    () => new Map(layoutPackage.deviceClassifications.map((c) => [c.sourceDeviceId, c])),
    [layoutPackage]
  );

  const trainingByDeviceId = useMemo(
    () => new Map(layoutPackage.trainingPack.map((t) => [t.detectedItemId, t])),
    [layoutPackage]
  );

  const issueCountByDeviceId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const issue of validationIssues) {
      for (const deviceId of issue.deviceIds) {
        counts.set(deviceId, (counts.get(deviceId) ?? 0) + 1);
      }
    }
    return counts;
  }, [validationIssues]);

  const totalRecords = activeReviewPack.records.length;
  const acceptedCount = activeReviewPack.records.filter((r) => r.reviewStatus === "accepted").length;
  const correctedCount = activeReviewPack.records.filter((r) => r.reviewStatus === "corrected").length;
  const rejectedCount = activeReviewPack.records.filter((r) => r.reviewStatus === "rejected").length;

  return (
    <section className="workbench-panel" aria-label="Project / Library Workbench">
      <div className="panel-heading">
        <span>Project / Library Workbench</span>
        <div className="panel-heading-actions">
          <strong>
            {totalRecords} records / {acceptedCount + correctedCount} reviewed
          </strong>
          <button className="panel-hide-button" type="button" onClick={onClose}>
            Hide
          </button>
        </div>
      </div>

      <div className="workbench-actions">
        <button
          type="button"
          onClick={onBuildProject}
          title="Activate in-app review editing from the current layout package"
        >
          Build Project Package
        </button>
        <button type="button" onClick={onExportProjectJson} title="Export full project as a single JSON file">
          Export Project JSON
        </button>
        <button type="button" onClick={onImportProjectJson} title="Import a previously exported project JSON">
          Import Project JSON
        </button>
        <span className="workbench-action-divider" aria-hidden="true" />
        <button type="button" onClick={onExportReviewArtifact} title="Export semantic review artifact JSON">
          Export Review Artifact
        </button>
        <button type="button" onClick={onImportReviewArtifact} title="Import a semantic review artifact">
          Import Review Artifact
        </button>
      </div>

      <div className="workbench-export-groups" aria-label="Workbench exports">
        <section className="workbench-export-group">
          <h3>Semantic</h3>
          <div>
            <button type="button" onClick={() => onExportSemanticSummary("json")}>
              Summary JSON
            </button>
            <button type="button" onClick={() => onExportSemanticSummary("markdown")}>
              Summary MD
            </button>
            <button type="button" onClick={() => onExportQaReport("json")}>
              QA JSON
            </button>
            <button type="button" onClick={() => onExportQaReport("markdown")}>
              QA MD
            </button>
          </div>
        </section>
        <section className="workbench-export-group">
          <h3>Advanced Layout</h3>
          <div>
            <button type="button" onClick={() => onExportAdvancedLayout("json")}>
              JSON
            </button>
            <button type="button" onClick={() => onExportAdvancedLayout("csv")}>
              CSV
            </button>
            <button type="button" onClick={() => onExportAdvancedLayout("markdown")}>
              MD
            </button>
          </div>
        </section>
        <section className="workbench-export-group">
          <h3>Layout Library</h3>
          <div>
            <button type="button" onClick={() => onExportLayoutLibrary("json")}>
              JSON
            </button>
            <button type="button" onClick={() => onExportLayoutLibrary("csv")}>
              CSV
            </button>
            <button type="button" onClick={() => onExportLayoutLibrary("markdown")}>
              MD
            </button>
          </div>
        </section>
        <section className="workbench-export-group">
          <h3>Review Pack</h3>
          <div>
            <button type="button" onClick={onExportReviewTemplate}>
              Template JSON
            </button>
            <button type="button" onClick={onImportReviewPack}>
              Import JSON
            </button>
          </div>
        </section>
        <section className="workbench-export-group">
          <h3>Training Truth</h3>
          <div>
            <button type="button" onClick={() => onExportTrainingTruth("json")}>
              JSON
            </button>
            <button type="button" onClick={() => onExportTrainingTruth("csv")}>
              CSV
            </button>
            <button type="button" onClick={() => onExportTrainingTruth("markdown")}>
              MD
            </button>
            <button type="button" onClick={onImportTrainingTruth}>
              Import JSON
            </button>
          </div>
        </section>
        <section className="workbench-export-group">
          <h3>Comparison</h3>
          <div>
            <button type="button" onClick={() => onExportTrainingTruthComparison("json")}>
              JSON
            </button>
            <button type="button" onClick={() => onExportTrainingTruthComparison("csv")}>
              CSV
            </button>
            <button type="button" onClick={() => onExportTrainingTruthComparison("markdown")}>
              MD
            </button>
          </div>
        </section>
        <section className="workbench-export-group">
          <h3>Reviewed Library</h3>
          <div>
            <button type="button" onClick={() => onExportReviewedLibrary("json")}>
              JSON
            </button>
            <button type="button" onClick={() => onExportReviewedLibrary("csv")}>
              CSV
            </button>
            <button type="button" onClick={() => onExportReviewedLibrary("markdown")}>
              MD
            </button>
          </div>
        </section>
      </div>

      <div className="workbench-actions workbench-view-actions">
        <button type="button" onClick={() => onExportQaReport("json")} title="Export the semantic QA report">
          Export QA Report
        </button>
        <button
          type="button"
          onClick={() => onExportReviewedLibrary("json")}
          title="Export the reviewed reusable layout library"
        >
          Export Reviewed Library
        </button>
        {statusMessage ? (
          <span className="workbench-status" role="status">
            {statusMessage}
          </span>
        ) : null}
      </div>

      {!isEditingLive ? (
        <p className="workbench-hint">
          Click <strong>Build Project Package</strong> to enable in-app review editing.
        </p>
      ) : null}

      <div className="workbench-review-section">
        <div className="workbench-section-heading">
          <h3>Semantic Review Table</h3>
          <span>
            {rejectedCount > 0 ? `${rejectedCount} rejected / ` : ""}
            {totalRecords} total
          </span>
        </div>
        <div className="workbench-table-scroll">
          <table className="review-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Detected Type</th>
                <th>Station</th>
                <th>Confidence</th>
                <th>Geometry</th>
                <th>Review Status</th>
                <th>Library</th>
                <th>Issues</th>
                {isEditingLive ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {activeReviewPack.records.map((record) => {
                const classification = classificationByDeviceId.get(record.detectedItemId);
                const training = trainingByDeviceId.get(record.detectedItemId);
                const issueCount = issueCountByDeviceId.get(record.detectedItemId) ?? 0;
                const hasLibraryMatch = Boolean(training?.linkedLibraryItemId);
                const isCorrectingThis = correctingRecordId === record.id;

                return (
                  <tr key={record.id} className={`review-row review-row--${record.reviewStatus}`}>
                    <td className="review-cell-label">
                      <strong>{record.detectedLabel}</strong>
                    </td>
                    <td>
                      {record.correctedDeviceType ? (
                        <span title={`Detected: ${deviceKindLabel(record.detectedDeviceType)}`}>
                          {deviceKindLabel(record.correctedDeviceType)} *
                        </span>
                      ) : (
                        deviceKindLabel(record.detectedDeviceType)
                      )}
                    </td>
                    <td>{classification?.stationId ?? "—"}</td>
                    <td>{record.confidence.toFixed(2)}</td>
                    <td className={`geom-status geom-status--${record.detectedGeometryAssociation.status}`}>
                      {geometryStatusLabel(record.detectedGeometryAssociation.status)}
                    </td>
                    <td className={`review-status review-status--${record.reviewStatus}`}>
                      {reviewStatusLabel(record.reviewStatus)}
                    </td>
                    <td>{hasLibraryMatch ? "✓" : "—"}</td>
                    <td>{issueCount > 0 ? <span className="issue-count">{issueCount}</span> : "—"}</td>
                    {isEditingLive ? (
                      <td className="review-action-bar">
                        <button
                          type="button"
                          className={record.reviewStatus === "accepted" ? "active" : ""}
                          onClick={() => onRecordStatusChange(record.id, "accepted")}
                          title="Mark as accepted"
                        >
                          Accept
                        </button>
                        {isCorrectingThis ? (
                          <select
                            defaultValue={record.correctedDeviceType ?? record.detectedDeviceType}
                            onChange={(e) => {
                              onRecordTypeCorrection(record.id, e.target.value as DeviceKind);
                              setCorrectingRecordId(undefined);
                            }}
                            onBlur={() => setCorrectingRecordId(undefined)}
                            autoFocus
                            aria-label={`Correct type for ${record.detectedLabel}`}
                          >
                            {DEVICE_KINDS.map((kind) => (
                              <option key={kind} value={kind}>
                                {deviceKindLabel(kind)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <button
                            type="button"
                            className={record.reviewStatus === "corrected" ? "active" : ""}
                            onClick={() => setCorrectingRecordId(record.id)}
                            title="Correct the detected device type"
                          >
                            Correct
                          </button>
                        )}
                        <button
                          type="button"
                          className={record.reviewStatus === "rejected" ? "active" : ""}
                          onClick={() => onRecordStatusChange(record.id, "rejected")}
                          title="Reject / unlink from training"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          className={record.reviewStatus === "uncertain" ? "active" : ""}
                          onClick={() => onRecordStatusChange(record.id, "uncertain")}
                          title="Mark as uncertain"
                        >
                          Uncertain
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="workbench-library-section">
        <div className="workbench-section-heading">
          <h3>Library Preview</h3>
          <span>{reviewedLibrary.summary.reusableItems} reusable items</span>
        </div>
        <div className="library-preview-grid">
          <div>
            <strong>Trainable</strong>
            <span>{reviewedLibrary.summary.reusableItems}</span>
          </div>
          <div>
            <strong>Accepted</strong>
            <span>{reviewedLibrary.summary.acceptedItems}</span>
          </div>
          <div>
            <strong>Corrected</strong>
            <span>{reviewedLibrary.summary.correctedItems}</span>
          </div>
          <div>
            <strong>Review-only</strong>
            <span>{reviewedLibrary.summary.reviewOnlyRecords}</span>
          </div>
          <div>
            <strong>Excluded</strong>
            <span>{reviewedLibrary.summary.excludedRecords}</span>
          </div>
        </div>
        {Object.keys(reviewedLibrary.summary.itemsByType).length > 0 ? (
          <div className="library-type-breakdown">
            <strong>By type</strong>
            <ol>
              {Object.entries(reviewedLibrary.summary.itemsByType).map(([type, count]) => (
                <li key={type}>
                  {deviceKindLabel(type as DeviceKind)}: {count}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        <div className="workbench-library-actions">
          <button type="button" onClick={() => onExportReviewedLibrary("json")}>
            Download JSON
          </button>
          <button type="button" onClick={() => onExportReviewedLibrary("csv")}>
            Download CSV
          </button>
          <button type="button" onClick={() => onExportReviewedLibrary("markdown")}>
            Download MD
          </button>
        </div>
      </div>
    </section>
  );
}
