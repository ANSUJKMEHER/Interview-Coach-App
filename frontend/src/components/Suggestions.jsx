import { useState } from "react";

export default function Suggestions({ data }) {
  if (!data) return null;
  const [open, setOpen] = useState(true);
  const { high, medium, low } = data;

  return (
    <div className="section collapsible">
      <div className="section-header" onClick={() => setOpen(!open)}>
        <h2>Improvement Suggestions</h2>
        <span className="collapse-icon">{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div className="section-body">
          {high.length > 0 && (
            <div className="suggestion-group suggestion-high">
              <h3>🔴 High Priority ({high.length})</h3>
              <ul>{high.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
          {medium.length > 0 && (
            <div className="suggestion-group suggestion-medium">
              <h3>🟡 Medium Priority ({medium.length})</h3>
              <ul>{medium.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
          {low.length > 0 && (
            <div className="suggestion-group suggestion-low">
              <h3>🟢 Low Priority ({low.length})</h3>
              <ul>{low.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
