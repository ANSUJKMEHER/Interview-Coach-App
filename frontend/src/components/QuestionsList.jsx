import { useState } from "react";

const DIFF = { Easy: { color: "#22c55e", bg: "#22c55e18" }, Medium: { color: "#f59e0b", bg: "#f59e0b18" }, Hard: { color: "#ef4444", bg: "#ef444418" } };

export default function QuestionsList({ title, questions, type }) {
  if (!questions || !questions.length) return null;
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDiff, setFilterDiff] = useState("all");
  const [filterTopic, setFilterTopic] = useState("all");
  const [copiedId, setCopiedId] = useState(null);
  const isTech = type === "technical";

  const topics = [...new Set(questions.map((q) => isTech ? q.topic : q.category).filter(Boolean))];

  const filtered = questions.filter((q) => {
    const text = isTech ? q.question : q.question;
    if (search && !text.toLowerCase().includes(search.toLowerCase()) && !(q.why || "").toLowerCase().includes(search.toLowerCase()) && !(q.starNote || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (filterDiff !== "all" && q.difficulty !== filterDiff) return false;
    if (filterTopic !== "all" && (isTech ? q.topic : q.category) !== filterTopic) return false;
    return true;
  });

  const copyQ = (q) => {
    const text = isTech ? `${q.question}\n\nWhy: ${q.why}` : `${q.question}\n\nTip: ${q.starNote}`;
    navigator.clipboard.writeText(text).then(() => { setCopiedId(q.id); setTimeout(() => setCopiedId(null), 2000); });
  };

  const copyAll = () => {
    const text = filtered.map((q, i) => {
      if (isTech) return `${i + 1}. [${q.difficulty}] ${q.topic || ""}: ${q.question}\n   ${q.why}`;
      return `${i + 1}. [${q.category || ""}] ${q.question}\n   Tip: ${q.starNote}`;
    }).join("\n\n");
    navigator.clipboard.writeText(text).then(() => { setCopiedId("all"); setTimeout(() => setCopiedId(null), 2000); });
  };

  return (
    <div className="section collapsible">
      <div className="section-header" onClick={() => setOpen(!open)}>
        <h2>{title} <span className="q-count">({questions.length})</span></h2>
        <span className="collapse-icon">{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div className="section-body">
          {/* Toolbar */}
          <div className="q-toolbar">
            <input className="q-search" type="text" placeholder="🔍 Search questions..." value={search} onChange={(e) => setSearch(e.target.value)} />
            {isTech && (
              <select className="q-filter" value={filterDiff} onChange={(e) => setFilterDiff(e.target.value)}>
                <option value="all">All difficulties</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            )}
            <select className="q-filter" value={filterTopic} onChange={(e) => setFilterTopic(e.target.value)}>
              <option value="all">All topics</option>
              {topics.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="btn-copy-all" onClick={copyAll}>{copiedId === "all" ? "✓ Copied!" : "📋 Copy All"}</button>
          </div>

          {/* Difficulty legend */}
          {isTech && (
            <div className="diff-legend">
              {Object.entries(DIFF).map(([k, v]) => <span key={k} className="diff-legend-item"><span className="legend-dot" style={{ background: v.color }} />{k}</span>)}
            </div>
          )}

          {/* Results info */}
          {(search || filterDiff !== "all" || filterTopic !== "all") && (
            <div className="filter-info">Showing {filtered.length} of {questions.length} questions</div>
          )}

          {/* Questions */}
          <div className="questions-list">
            {filtered.length === 0 && <div className="no-results">No questions match your filters.</div>}
            {filtered.map((q) => (
              <div key={q.id} className="question-card">
                <div className="question-header">
                  <span className="question-number">{isTech ? "Q" : "#"}{q.id}</span>
                  {isTech && q.difficulty && <span className="difficulty-badge" style={{ color: DIFF[q.difficulty]?.color, background: DIFF[q.difficulty]?.bg }}>{q.difficulty}</span>}
                  {isTech && q.topic && <span className="topic-badge">{q.topic}</span>}
                  {!isTech && q.category && <span className="topic-badge">{q.category}</span>}
                  <button className="btn-copy" onClick={() => copyQ(q)} title="Copy to clipboard">{copiedId === q.id ? "✓" : "📋"}</button>
                </div>
                <p className="question-text">{q.question}</p>
                {q.why && <p className="question-why">💡 {q.why}</p>}
                {q.starNote && <p className="question-star">⭐ <em>{q.starNote}</em></p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
