import { useState, useRef, useCallback } from "react";
import FileUpload from "./components/FileUpload";
import ResumeScore from "./components/ResumeScore";
import SkillsSummary from "./components/SkillsSummary";
import QuestionsList from "./components/QuestionsList";
import Suggestions from "./components/Suggestions";

export default function App() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [theme, setTheme] = useState(() => localStorage.getItem("ic-theme") || "dark");
  const [success, setSuccess] = useState(false);
  const abortRef = useRef(null);

  const toggleTheme = () => setTheme((t) => {
    const next = t === "dark" ? "light" : "dark";
    localStorage.setItem("ic-theme", next);
    return next;
  });

  const handleUpload = useCallback(async (file) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setSuccess(false);
    setProgress(15);

    const form = new FormData();
    form.append("resume", file);

    // Simulate progress ticks
    const progressTimer = setInterval(() => {
      setProgress((p) => Math.min(p + Math.random() * 12, 90));
    }, 400);

    try {
      const controller = new AbortController();
      abortRef.current = controller;
      const res = await fetch("/api/upload", { method: "POST", body: form, signal: controller.signal });
      clearInterval(progressTimer);
      setProgress(95);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error (${res.status})`);
      }
      const data = await res.json();
      setResult(data);
      setProgress(100);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      clearInterval(progressTimer);
      if (err.name === "AbortError") {
        setError("Upload cancelled.");
      } else {
        setError(err.message || "Analysis failed. Please try again.");
      }
      setProgress(0);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRetry = () => {
    setError(null);
    setProgress(0);
  };

  const handleCancel = () => {
    if (abortRef.current) abortRef.current.abort();
  };

  const handleExportText = () => {
    if (!result) return;
    let text = "AI INTERVIEW COACH REPORT\n" + "=".repeat(50) + "\n\n";
    text += `Resume Score: ${result.scores.overall}/10\n\n`;
    result.scores.dimensions.forEach((d) => {
      text += `  ${d.name}: ${d.score}/10 — ${d.notes}\n`;
    });
    text += "\nSKILLS\n" + "-".repeat(30) + "\n";
    result.skills.forEach((c) => { text += `  ${c.name}: ${c.skills.join(", ")}\n`; });
    text += "\nTECHNICAL QUESTIONS\n" + "-".repeat(30) + "\n";
    result.technical.forEach((q) => { text += `  Q${q.id}. [${q.difficulty}] ${q.question}\n  ${q.why}\n\n`; });
    text += "\nHR QUESTIONS\n" + "-".repeat(30) + "\n";
    result.hr.forEach((q) => { text += `  Q${q.id}. [${q.category}] ${q.question}\n  Tip: ${q.starNote}\n\n`; });
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "interview-report.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`app theme-${theme}`}>
      <header>
        <div className="header-row">
          <div className="header-title">
            <h1>🎯 AI Interview Coach</h1>
            <p>Upload your resume PDF and get a complete interview prep package</p>
          </div>
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      <main>
        <FileUpload onUpload={handleUpload} loading={loading} progress={progress} error={error} onRetry={handleRetry} onCancel={handleCancel} />

        {success && (
          <div className="notification success">
            ✅ Analysis complete! Scroll down to see your results.
          </div>
        )}

        {result && (
          <div className="results">
            <div className="results-toolbar">
              <div className="result-meta">
                Analyzed {result.pageCount} page{result.pageCount > 1 ? "s" : ""} &bull; {result.technical?.length || 0} technical &bull; {result.hr?.length || 0} HR
              </div>
              <button className="btn-export" onClick={handleExportText}>📄 Download Report</button>
            </div>
            <ResumeScore data={result.scores} />
            <SkillsSummary categories={result.skills} />
            <QuestionsList title="Technical Interview Questions" questions={result.technical} type="technical" />
            <QuestionsList title="HR / Behavioral Questions" questions={result.hr} type="hr" />
            <Suggestions data={result.suggestions} />
          </div>
        )}
      </main>

      <footer>
        <p>AI Interview Coach &bull; Built for the Hermes Agent Challenge</p>
      </footer>
    </div>
  );
}
