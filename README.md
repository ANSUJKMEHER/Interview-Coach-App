# AI Interview Coach

A full-stack web application that analyzes resumes and generates personalized interview preparation packages. Built with React + Express for the Hermes Agent Challenge.

## Overview

Upload a resume PDF and instantly receive:

- **Resume Score** — rated across 5 dimensions (formatting, completeness, skills relevance, experience impact, education)
- **Skills Summary** — auto-detected and grouped by category
- **20 Technical Interview Questions** — tailored to your actual skills and projects
- **10 HR / Behavioral Questions** — with STAR-method framing tips
- **Improvement Suggestions** — prioritized by impact

No API keys or external services required. Everything runs locally.

## Architecture

```
interview-coach-app/
├── backend/
│   ├── server.js              # Express server — upload handling, analysis engine
│   ├── package.json           # Dependencies: express, multer, cors
│   └── tmp/                   # Temp directory for PDF processing
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Main app — theme toggle, upload, results orchestration
│   │   ├── main.jsx           # React entry point
│   │   ├── index.css          # Theme variables (dark/light), layout, components
│   │   └── components/
│   │       ├── FileUpload.jsx     # Drag & drop upload with progress bar
│   │       ├── ResumeScore.jsx    # Score circle + dimension breakdown table
│   │       ├── SkillsSummary.jsx  # Color-coded skill category cards
│   │       ├── QuestionsList.jsx  # Search, filter, copy, collapsible sections
│   │       └── Suggestions.jsx    # Priority-grouped improvement suggestions
│   ├── public/                # Static assets
│   ├── dist/                  # Production build output
│   ├── package.json           # Dependencies: react, vite
│   └── vite.config.js         # Vite config with API proxy
└── README.md
```

**Data flow:**

1. User drops a PDF onto the upload zone
2. Frontend sends `multipart/form-data` to `POST /api/upload`
3. Express validates the file (type, size), saves to temp
4. Server spawns `extract_resume.py` (via pymupdf) to extract text
5. Analysis engine scores, extracts skills, generates questions
6. Results are deduplicated and returned as JSON
7. React renders all five sections with search, filter, and export

## Features

- **PDF text extraction** via pymupdf (handles Unicode, ligatures, special characters)
- **Rule-based analysis engine** — no external API calls or keys needed
- **Dark/light theme** with persistent preference (localStorage)
- **Upload progress indicator** with cancel support
- **Collapsible result sections** — focus on what matters
- **Search & filter questions** by text, difficulty, and topic
- **Copy to clipboard** — per question or all at once
- **Download report** as formatted text file
- **Duplicate detection** — every question is unique
- **Responsive design** — works on mobile through desktop
- **Request logging** with timing for debugging
- **Structured error handling** with user-friendly messages

## Screenshots

*Run the app and upload a resume to see these in action:*

| Section | Description |
|---------|-------------|
| Upload Zone | Drag & drop or click to browse — shows file name and progress bar |
| Resume Score | Circular score indicator + 5-dimension breakdown table with color-coded bars |
| Skills Summary | Grid of color-coded category cards (Languages, Frameworks, ML, Cloud, Databases, Tools) |
| Technical Questions | Searchable, filterable cards with difficulty badges (Easy/Medium/Hard), topic tags, copy buttons |
| HR Questions | Category-tagged behavioral questions with STAR-method tips |
| Suggestions | Priority-grouped improvement suggestions (High/Medium/Low) |

## Installation

**Prerequisites:** Node.js 18+, Python 3.11+ with pymupdf

```bash
# 1. Clone or navigate to the project
cd C:\Users\ansuj\interview-coach-app

# 2. Install backend dependencies
cd backend
npm install

# 3. Install frontend dependencies
cd ../frontend
npm install

# 4. (Optional) Install pymupdf for PDF extraction
# If you don't have it yet:
uv venv .venvs/interview-coach
uv pip install --python .venvs/interview-coach pymupdf
```

## Usage

### Development mode (two terminals)

```bash
# Terminal 1 — Start backend
cd C:\Users\ansuj\interview-coach-app\backend
node server.js
# Server runs at http://localhost:3001

# Terminal 2 — Start frontend dev server
cd C:\Users\ansuj\interview-coach-app\frontend
npm run dev
# Dev server at http://localhost:5173 (proxies API to :3001)
```

### Production mode (single command)

```bash
# Build the frontend
cd C:\Users\ansuj\interview-coach-app\frontend
npm run build

# Start the backend (serves built frontend from dist/)
cd ../backend
node server.js
# Open http://localhost:3001
```

### Using the app

1. Open the app in your browser
2. Drag & drop your resume PDF onto the upload zone (or click to browse)
3. Wait for analysis (typically 2-5 seconds)
4. Browse your results — all sections are collapsible
5. Use the search bar to filter questions by keyword
6. Use the difficulty/topic dropdowns to narrow results
7. Click the copy button on any question to clipboard
8. Click "Download Report" to save a text copy
9. Toggle dark/light mode with the button in the header

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite 5, CSS Custom Properties |
| Backend | Node.js, Express 4, Multer |
| PDF Extraction | Python, pymupdf (fitz) |
| Analysis | Custom rule-based engine (no external APIs) |

## License

MIT — see [LICENSE](./LICENSE) for details.
