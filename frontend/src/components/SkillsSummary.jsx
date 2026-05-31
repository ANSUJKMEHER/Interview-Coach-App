import { useState } from "react";

const CAT_COLORS = ["#3b82f6","#8b5cf6","#ec4899","#10b981","#f59e0b","#06b6d4","#f97316","#6366f1"];

export default function SkillsSummary({ categories }) {
  if (!categories || !categories.length) return null;
  const [open, setOpen] = useState(true);

  return (
    <div className="section collapsible">
      <div className="section-header" onClick={() => setOpen(!open)}>
        <h2>Skills Summary</h2>
        <span className="collapse-icon">{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div className="section-body">
          <div className="skills-grid">
            {categories.map((cat, i) => (
              <div key={cat.name} className="skill-category">
                <h3 style={{ borderColor: CAT_COLORS[i % CAT_COLORS.length] }}>{cat.name}</h3>
                <div className="skill-tags">
                  {cat.skills.map((s) => (
                    <span key={s} className="skill-tag" style={{ background: CAT_COLORS[i % CAT_COLORS.length] + "15", borderColor: CAT_COLORS[i % CAT_COLORS.length] + "40", color: CAT_COLORS[i % CAT_COLORS.length] }}>{s}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
