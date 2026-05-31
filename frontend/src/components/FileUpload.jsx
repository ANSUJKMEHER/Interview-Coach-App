import { useState, useRef } from "react";

export default function FileUpload({ onUpload, loading, progress, error, onRetry, onCancel }) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [validationError, setValidationError] = useState("");
  const inputRef = useRef(null);

  const handleFile = (file) => {
    if (!file) return;
    setValidationError("");
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setValidationError("Please upload a PDF file (.pdf)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setValidationError("File too large. Maximum size is 10 MB.");
      return;
    }
    setFileName(file.name);
    onUpload(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  return (
    <div className="section upload-section">
      <h2>Upload Your Resume</h2>
      <p className="subtitle">Upload a PDF resume to get your personalized interview prep package</p>

      <div
        className={`dropzone ${dragOver ? "drag-over" : ""} ${loading ? "disabled" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !loading && inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".pdf,application/pdf" hidden onChange={(e) => handleFile(e.target.files[0])} />

        {loading ? (
          <div className="upload-progress">
            <div className="spinner" />
            <span className="progress-label">Analyzing resume...</span>
            <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
            <span className="progress-pct">{Math.round(progress)}%</span>
            <button className="btn-cancel" onClick={(e) => { e.stopPropagation(); onCancel(); }}>Cancel</button>
          </div>
        ) : (
          <>
            <div className="dropzone-icon">📄</div>
            {fileName && <span className="file-name">{fileName}</span>}
            <span className="drop-text">{fileName ? "Click or drop to replace" : "Drag & drop your resume here"}</span>
            <span className="hint">or click to browse &bull; PDF only &bull; Max 10MB</span>
          </>
        )}
      </div>

      {(error || validationError) && (
        <div className="error-banner">
          <div className="error-body">
            <strong>⚠ {(error || "").includes("INVALID") || (error || "").includes("Only PDF") ? "Invalid file" : "Error"}:</strong> {error || validationError}
          </div>
          <button className="btn-retry" onClick={(e) => { e.stopPropagation(); onRetry(); inputRef.current?.click(); }}>Try Again</button>
        </div>
      )}
    </div>
  );
}
