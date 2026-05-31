import { useState } from "react";

export default function ResumeScore({ data }) {
  if (!data) return null;
  const { dimensions, overall } = data;
  const [open, setOpen] = useState(true);

  const scoreColor = (s) => s >= 8 ? "var(--green)" : s >= 6 ? "var(--yellow)" : "var(--red)";
  const scoreLabel = (s) => s >= 8 ? "Excellent" : s >= 6 ? "Good" : s >= 4 ? "Needs Work" : "Weak";

  return (
    <div className="section collapsible">
      <div className="section-header" onClick={() => setOpen(!open)}>
        <h2>Resume Score</h2>
        <span className="collapse-icon">{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div className="section-body">
          <div className="overall-score">
            <div className="score-circle" style={{ borderColor: scoreColor(overall) }}>
              <span className="score-number" style={{ color: scoreColor(overall) }}>{overall}</span>
              <span className="score-max">/10</span>
            </div>
            <div className="score-summary">
              <h3>{scoreLabel(overall)}</h3>
              <p>Your resume scores <strong>{overall}/10</strong> overall. {overall >= 7 ? "Solid foundation — see tips below to make it exceptional." : "Several high-impact improvements available."}</p>
            </div>
          </div>
          <table className="score-table">
            <thead><tr><th>Dimension</th><th>Score</th><th></th><th>Notes</th></tr></thead>
            <tbody>
              {dimensions.map((d) => (
                <tr key={d.name}>
                  <td className="dim-name">{d.name}</td>
                  <td><span className="score-badge" style={{ background: scoreColor(d.score) + "20", color: scoreColor(d.score) }}>{d.score}/10</span></td>
                  <td className="dim-bar"><div className="bar-bg"><div className="bar-fill" style={{ width: `${d.score * 10}%`, background: scoreColor(d.score) }} /></div></td>
                  <td className="dim-notes">{d.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
