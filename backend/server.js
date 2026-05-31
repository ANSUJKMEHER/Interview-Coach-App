const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Request logger
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  const start = Date.now();
  const id = Math.random().toString(36).slice(2, 8);
  req.reqId = id;
  console.log(`[${new Date().toISOString()}] ${id} --> ${req.method} ${req.url}`);
  const origEnd = res.end;
  res.end = function (...args) {
    console.log(`[${new Date().toISOString()}] ${id} <-- ${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`);
    origEnd.apply(res, args);
  };
  next();
});

// Serve built frontend
app.use(express.static(path.join(__dirname, "..", "frontend", "dist")));

// ---------------------------------------------------------------------------
// Multer: accept only PDFs, write to disk (avoids UTF-8 buffer issues)
// ---------------------------------------------------------------------------
const tmpDir = os.tmpdir();

const upload = multer({
  dest: tmpDir,
  fileFilter: (req, file, cb) => {
    const isPdf =
      file.mimetype === "application/pdf" ||
      path.extname(file.originalname).toLowerCase() === ".pdf";
    if (isPdf) {
      cb(null, true);
    } else {
      cb(new Error("INVALID_TYPE: Only PDF files are accepted"), false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ---------------------------------------------------------------------------
// Helper: call extract_resume.py
// ---------------------------------------------------------------------------
function extractResumeText(pdfPath) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "extract_resume.py");
    // Use 'python3' on Linux/Mac, fallback to 'python' on Windows if needed, 
    // but in Docker/Render it will be 'python3'
    const pythonExe = process.env.PYTHON_CMD || "python3";

    const proc = spawn(pythonExe, [scriptPath, pdfPath, "--json"], {
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => { stdout += data.toString("utf-8"); });
    proc.stderr.on("data", (data) => { stderr += data.toString("utf-8"); });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject("EXTRACT_TIMEOUT");
    }, 30000);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(stderr || `Extraction process exited with code ${code}`);
      } else {
        try { resolve(JSON.parse(stdout)); }
        catch { reject("PARSE_ERROR"); }
      }
    });
  });
}

// ---------------------------------------------------------------------------
// POST /api/upload
// ---------------------------------------------------------------------------
app.post("/api/upload", (req, res) => {
  upload.single("resume")(req, res, async (err) => {
    if (err) {
      let status = 400;
      let message = err.message || "Upload failed";
      if (message.startsWith("INVALID_TYPE")) { status = 415; message = "Only PDF files are allowed."; }
      else if (message.startsWith("LIMIT_FILE_SIZE")) { status = 413; message = "File too large (max 10 MB)."; }
      if (req.file && req.file.path) { try { fs.unlinkSync(req.file.path); } catch {} }
      return res.status(status).json({ error: message });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    let extracted;
    try {
      extracted = await extractResumeText(req.file.path);
    } catch (e) {
      if (req.file.path) try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(500).json({ error: typeof e === "string" ? e : "Extraction failed." });
    }
    try { fs.unlinkSync(req.file.path); } catch {}

    if (!extracted.text || extracted.text.trim().length < 50) {
      return res.status(422).json({ error: "Could not extract meaningful text from this PDF. It may be image-based." });
    }

    try {
      const analysis = analyzeResume(extracted.text);
      res.json({ success: true, pageCount: extracted.page_count, ...analysis });
    } catch (e) {
      console.error("Analysis error:", e);
      res.status(500).json({ error: "Analysis failed." });
    }
  });
});

// ---------------------------------------------------------------------------
// Duplicate-detection helper
// ---------------------------------------------------------------------------
function deduplicateQuestions(questions) {
  const seen = new Set();
  const result = [];
  let id = 1;
  for (const q of questions) {
    const key = q.question.trim().toLowerCase().replace(/\s+/g, " ");
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ ...q, id: id++ });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Analysis engine
// ---------------------------------------------------------------------------
function analyzeResume(text) {
  const lower = text.toLowerCase();
  const scores = scoreResume(text, lower);
  const skills = extractSkills(text, lower);
  let technical = deduplicateQuestions(generateTechnicalQuestions(text, lower, skills));
  let hr = deduplicateQuestions(generateHRQuestions(text, lower));
  const suggestions = generateSuggestions(text, lower, scores);
  technical = padArray(technical, TECH_FALLBACKS, 20);
  hr = padArray(hr, HR_FALLBACKS, 10);
  return { scores, skills, technical, hr, suggestions };
}

function padArray(existing, fallbacks, target) {
  const result = [...existing];
  let i = 0;
  const existingKeys = new Set(result.map((q) => q.question.trim().toLowerCase()));
  while (result.length < target && i < fallbacks.length) {
    const fb = fallbacks[i++];
    if (!existingKeys.has(fb.question.trim().toLowerCase())) {
      result.push(fb);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
function scoreResume(text, lower) {
  let formatting = 4;
  if (text.includes("•") || text.includes("- ") || text.includes("* ")) formatting += 1.5;
  if (/^#|^##|^[A-Z][A-Z ]{2,}|\*\*[^*]+\*\*/m.test(text)) formatting += 1.5;
  if (text.split("\n").filter((l) => l.trim()).length > 25) formatting += 1;
  if (text.length > 2000) formatting += 1;
  formatting = Math.min(Math.round(formatting), 10);

  let completeness = 2;
  ["education","experience","intern","project","skill","certif","summary","objective","award","honor"].forEach((kw) => {
    if (lower.includes(kw)) completeness += 1.5;
  });
  completeness = Math.min(Math.round(completeness), 10);

  let skillsScore = 3;
  const techKw = ["python","javascript","typescript","react","node","angular","vue","sql","nosql",
    "postgresql","mongodb","redis","docker","kubernetes","aws","azure","gcp","terraform","git",
    "ci/cd","machine learning","deep learning","tensorflow","pytorch","nlp","data","java","c++",
    "go","rust","graphql","rest","flask","django","express","next.js","spring","agile","scrum"];
  skillsScore += Math.min(techKw.filter((k) => lower.includes(k)).length, 7);
  skillsScore = Math.min(skillsScore, 10);

  let impact = 3;
  if (/\d+%/.test(text)) impact += 2;
  if (/\d+\+ (users|requests|events|bugs|projects|modules)/i.test(text)) impact += 1.5;
  if (/reduced|improved|increased|optimized|accelerated/i.test(text)) impact += 1.5;
  if (/led|owned|driven|spearheaded|initiated/i.test(text)) impact += 1;
  if (/\d+K\+|\d+M\+|\d+TB|\$[\d,]+/i.test(text)) impact += 1;
  impact = Math.min(Math.round(impact), 10);

  let education = 4;
  if (/b\.|btech|b\.s\.|bachelor/i.test(text)) education += 1;
  if (/m\.|mtech|m\.s\.|master|ph\.?d/i.test(text)) education += 1;
  if (/cgpa|gpa|\d\.\d\s*\/\s*(10|4)/i.test(text)) education += 1.5;
  if (lower.includes("certified") || lower.includes("certification")) education += 1.5;
  if (/dean'?s list|honor|scholarship/i.test(text)) education += 1;
  education = Math.min(Math.round(education), 10);

  const overall = Math.round((formatting + completeness + skillsScore + impact + education) / 5);

  return {
    dimensions: [
      { name: "Formatting & Readability", score: formatting,
        notes: formatting >= 7 ? "Well-structured with clear hierarchy" : formatting >= 5 ? "Adequate; add bullets and headers" : "Sparse — add sections and bullets" },
      { name: "Content Completeness", score: completeness,
        notes: completeness >= 7 ? "Covers all major sections" : "Missing sections: add summary, certs, or projects" },
      { name: "Skills Relevance", score: skillsScore, notes: `${Math.round((skillsScore - 3) / 7 * techKw.length)} relevant tech keywords found` },
      { name: "Experience Impact", score: impact,
        notes: impact >= 7 ? "Strong quantified results" : "Add metrics (%, $, users, latency)" },
      { name: "Education & Certs", score: education,
        notes: education >= 7 ? "Strong education + certifications" : "Add GPA, coursework, or certifications" },
    ],
    overall,
  };
}

// ---------------------------------------------------------------------------
// Skill extraction
// ---------------------------------------------------------------------------
function extractSkills(text, lower) {
  const cats = [
    { name: "Languages", kw: ["python","java","javascript","typescript","c++","c","go","rust","ruby","php","swift","kotlin","scala","r","matlab","bash","shell","html","css","sql"] },
    { name: "Frameworks", kw: ["react","angular","angularjs","vue","next.js","node.js","express","flask","django","fastapi","spring","graphql","rest","bootstrap","tailwind","redux","webpack","vite"] },
    { name: "ML / AI", kw: ["tensorflow","keras","pytorch","scikit-learn","nlp","transformers","computer vision","opencv","deep learning","machine learning","pandas","numpy","huggingface","langchain","llm","mlflow"] },
    { name: "Cloud & DevOps", kw: ["aws","azure","gcp","docker","kubernetes","k8s","terraform","jenkins","ci/cd","github actions","linux","nginx","heroku","vercel","netlify"] },
    { name: "Databases", kw: ["mysql","postgresql","postgres","mongodb","redis","elasticsearch","firebase","sqlite","dynamodb","prisma","oracle","cassandra"] },
    { name: "Tools & Practices", kw: ["git","jira","figma","postman","vscode","intellij","agile","scrum","confluence","notion","slack","trello"] },
  ];
  return cats.map((c) => ({ name: c.name, skills: c.kw.filter((k) => lower.includes(k)) })).filter((c) => c.skills.length > 0);
}

// ---------------------------------------------------------------------------
// Technical Questions
// ---------------------------------------------------------------------------
function generateTechnicalQuestions(text, lower, skills) {
  const all = skills.flatMap((c) => c.skills);
  const seen = new Set();
  const qs = [];
  const add = (topic, diff, q, why) => { const k = q.trim().toLowerCase(); if (!seen.has(k)) { seen.add(k); qs.push({ topic, difficulty: diff, question: q, why }); } };

  const has = (list) => all.some((s) => list.includes(s));
  const txt = (kw) => lower.includes(kw);

  if (has(["tensorflow","keras"])) {
    add("Deep Learning", "Medium", "Explain the difference between a Dense layer and a Conv2D layer. When would you use each?", "You have TensorFlow/Keras on your resume.");
    add("Deep Learning", "Medium", "How does batch normalization work and what problem does it solve?", "Batch norm is fundamental for Keras/TensorFlow production work.");
    add("Deep Learning", "Hard", "Describe the vanishing gradient problem and how residual connections address it.", "Training dynamics understanding is essential for deep learning roles.");
    add("Deep Learning", "Hard", "You used transfer learning with MobileNetV2. Explain why you'd freeze early layers vs fine-tune them all.", "Your EarthSense-AI project used transfer learning — interviewers will probe the reasoning.");
  }
  if (has(["pytorch"])) add("Deep Learning", "Medium", "Compare PyTorch's eager execution with TensorFlow's graph mode. What are the tradeoffs?", "PyTorch is listed — understanding execution models shows depth.");
  if (has(["nlp","transformers"])) {
    add("NLP", "Hard", "Explain self-attention in Transformers. Why does it scale quadratically with sequence length?", "Transformers & NLP are listed — attention is the core concept.");
    add("NLP", "Medium", "What is the difference between BERT and GPT architectures? When would you choose one?", "NLP skills imply familiarity with modern language model architectures.");
  }
  if (has(["computer vision","opencv"])) {
    add("Computer Vision", "Medium", "How does Grad-CAM generate class activation maps? What are its limitations?", "You used Grad-CAM in EarthSense-AI — this tests if you understand the technique.");
    add("Computer Vision", "Medium", "What is the role of pooling layers in a CNN? Compare max pooling vs average pooling.", "CNN knowledge is expected for any computer vision work.");
  }
  if (has(["react"])) {
    add("React", "Easy", "Explain the difference between state and props in React. When would you lift state up?", "React is a core skill — fundamental interview staple.");
    add("React", "Medium", "How does useEffect's dependency array work? What bugs can an incorrect array cause?", "Stale closures and infinite loops are common hooks interview topics.");
    add("React", "Medium", "Compare useState, useReducer, and useContext. When would you use each?", "Shows understanding of React's full state management options.");
    add("React", "Hard", "How would you optimize a React app rendering a large list? Describe virtualization.", "Performance optimization distinguishes mid-level from junior React developers.");
  }
  if (has(["angular","angularjs"])) add("Frontend", "Medium", "Compare Angular's change detection with React's reconciliation. How do they differ?", "You have Angular experience — comparing frameworks shows architectural thinking.");
  if (has(["typescript"])) {
    add("TypeScript", "Easy", "What is the difference between 'interface' and 'type' in TypeScript?", "TypeScript is listed — common screening question.");
    add("TypeScript", "Medium", "Explain generics in TypeScript. Write a typed generic function that returns the first element of an array.", "Generics separate basic from intermediate TypeScript usage.");
  }
  if (has(["node.js","express"])) {
    add("Backend", "Medium", "Explain the Node.js event loop. How does it handle concurrent I/O with a single thread?", "Node.js is core — the event loop is the #1 backend interview question.");
    add("Backend", "Hard", "How would you diagnose a memory leak in a long-running Node.js process?", "Production debugging is a critical backend skill.");
  }
  if (has(["flask","django","fastapi"])) {
    add("Backend", "Easy", "Compare Flask, Django, and FastAPI. When would you choose one?", "Python web framework selection is a standard backend interview topic.");
    add("Backend", "Medium", "How would you deploy a Flask model service to handle 1,000 predictions per second?", "You deployed a Flask service — scaling it is the natural next question.");
  }
  if (has(["postgresql","postgres","mysql"])) {
    add("Databases", "Easy", "What is the difference between INNER JOIN and LEFT JOIN? Give a real-world example.", "SQL databases on your resume — joins are tested in nearly every backend interview.");
    add("Databases", "Medium", "How do database indexes work? When can an index slow down writes?", "Index knowledge separates junior from mid-level engineers.");
  }
  if (has(["mongodb"])) add("Databases", "Medium", "When would you choose MongoDB over PostgreSQL? Discuss consistency tradeoffs.", "Both are listed — showing you can choose intentionally matters.");
  if (has(["redis"])) add("Databases", "Medium", "What data structures does Redis support? How would you implement a rate limiter with Redis?", "Redis is listed — caching and rate limiting are common real-world uses.");
  if (has(["docker"])) add("DevOps", "Easy", "What is the difference between a Docker image and a container? Explain layer caching.", "Docker is listed — fundamentals are expected for modern roles.");
  if (has(["aws"])) {
    add("Cloud", "Medium", "Compare AWS ECS, Lambda, and EC2. How would you choose among them for a new service?", "AWS is listed — choosing the right compute service shows practical cloud knowledge.");
    add("Cloud", "Medium", "What is an S3 bucket policy vs an IAM policy? When would you use each?", "AWS security basics are increasingly screened in non-DevOps interviews.");
  }
  if (has(["kubernetes","k8s"])) add("DevOps", "Hard", "Explain Kubernetes liveness vs readiness probes. What happens when each fails?", "K8s knowledge is listed — probe configuration is a core operational concept.");
  if (txt("socket") || txt("real-time") || txt("real time")) {
    add("Real-Time", "Medium", "How does Socket.io handle transport fallback from WebSocket to HTTP long-polling?", "You built a real-time chat app — understanding transport mechanisms shows depth.");
    add("Real-Time", "Hard", "How would you scale a Socket.io server to 10,000 concurrent connections?", "Scaling real-time systems is a common system design follow-up.");
  }
  if (txt("cybersecurity") || txt("security") || txt("authentication")) {
    add("Security", "Easy", "What is the difference between symmetric and asymmetric encryption? Give examples.", "Security is on your resume — fundamental crypto concepts are fair game.");
    add("Security", "Medium", "Explain the OAuth 2.0 authorization code flow. How does it differ from JWT?", "You implemented JWT auth — understanding authn vs authz is important.");
  }
  add("Algorithms", "Easy", "Reverse a linked list iteratively and recursively. Compare time and space complexity.", "DSA is listed — this is a universal screening question.");
  add("Algorithms", "Medium", "Find the longest substring without repeating characters in O(n) time.", "Sliding window + hashing problems are among the most frequently asked questions.");
  add("Algorithms", "Medium", "Given a stream of integers, efficiently find the median at any point. What data structures would you use?", "Heaps are listed under DSA — this tests practical heap application.");
  if (txt("agile") || txt("scrum")) add("Process", "Easy", "Describe how you've worked in Agile sprints. What ceremonies did you participate in?", "Agile is listed — tests practical familiarity, not just buzzword knowledge.");

  return qs;
}

const TECH_FALLBACKS = [
  { topic: "Problem Solving", difficulty: "Medium", question: "Describe a challenging bug you encountered. How did you diagnose and fix it?", why: "Every software role tests debugging methodology." },
  { topic: "System Design", difficulty: "Medium", question: "How would you design a URL shortener like bit.ly? Walk through the architecture.", why: "System design is a standard mid-level interview topic." },
  { topic: "Code Quality", difficulty: "Easy", question: "What's your approach to writing maintainable, well-tested code?", why: "Code quality signals senior-level thinking." },
  { topic: "Collaboration", difficulty: "Easy", question: "How do you handle code reviews — both giving and receiving feedback?", why: "Collaboration skills are tested in nearly every interview loop." },
  { topic: "Performance", difficulty: "Medium", question: "How would you identify and fix a slow API endpoint? List your diagnostic steps.", why: "Performance debugging is a practical backend skill." },
  { topic: "Testing", difficulty: "Easy", question: "What's your testing strategy? How do you decide what to unit test vs integration test?", why: "Testing approach reveals engineering maturity." },
  { topic: "APIs", difficulty: "Easy", question: "Explain idempotency in REST APIs. Why does it matter?", why: "API design knowledge is expected for any web developer." },
  { topic: "Security", difficulty: "Medium", question: "What is SQL injection and how do you prevent it in your stack?", why: "Security awareness is increasingly screened in early rounds." },
  { topic: "DevOps", difficulty: "Easy", question: "Describe your ideal CI/CD pipeline for a small team project.", why: "CI/CD familiarity is a baseline expectation for modern engineering." },
  { topic: "Architecture", difficulty: "Hard", question: "How would you break a monolithic application into microservices? What are the key challenges?", why: "Architecture migration is a common senior-level discussion topic." },
];

// ---------------------------------------------------------------------------
// HR Questions
// ---------------------------------------------------------------------------
function generateHRQuestions(text, lower) {
  const seen = new Set();
  const qs = [];
  const add = (cat, q, note) => { const k = q.trim().toLowerCase(); if (!seen.has(k)) { seen.add(k); qs.push({ category: cat, question: q, starNote: note }); } };

  const isStudent = /b\.|btech|b\.s\.|bachelor|under(grad)?/.test(lower);
  const hasIntern = lower.includes("intern");
  const hasProjects = (text.match(/project/gi) || []).length >= 2;
  const hasLeadership = /led|mentor|lead|managed|supervised|guided/i.test(lower);

  add("Motivation",
    isStudent ? "You're currently pursuing your degree. What sparked your interest in this field, and how have your projects confirmed it?"
             : "What motivated you to pursue this career path, and how does this role align with your long-term goals?",
    "Connect a personal story to your career direction. Be specific about moments, not generic interests.");

  add("Learning & Growth",
    "Tell me about a time you learned a completely new technology from scratch to deliver a project. Walk me through your approach.",
    "Situation: new tech requirement. Task: deliver. Action: learning strategy. Result: shipped outcome.");

  add("Teamwork",
    hasIntern ? "During your internship, describe collaborating with someone who had a very different working style. How did you find common ground?"
             : "Describe a team project where members disagreed on the technical approach. How was it resolved?",
    "Show empathy, communication, and focus on shared goals rather than being 'right'.");

  add("Failure & Learning",
    hasProjects ? "Tell me about a project that didn't work as expected. What went wrong, and what would you do differently?"
               : "Describe a time you received critical feedback. How did you respond and what changed?",
    "Be honest — interviewers value self-awareness over pretending nothing ever went wrong.");

  add("Initiative",
    isStudent ? "You built multiple projects alongside coursework. How do you decide what to build and make time for self-directed work?"
             : "Tell me about a time you went beyond assigned responsibilities to improve a process.",
    "Shows self-direction — a key trait employers look for.");

  add("Communication",
    "Explain one of your projects to me as if I were a non-technical product manager. How would you describe its value?",
    "Translating technical complexity into business value is critical for cross-functional work.");

  add("Adaptability",
    "Tell me about a time requirements changed significantly mid-project. How did you adapt your plan?",
    "Agile environments require flexibility — show you can pivot without losing momentum.");

  if (hasLeadership) {
    add("Leadership", "You mentioned leading or mentoring. Describe a specific situation where your guidance made a measurable difference.",
      "Quantify the impact of your leadership — even small-scale mentoring counts.");
  } else {
    add("Problem Solving", "Describe a complex bug you faced. Walk me through your systematic debugging process.",
      "Situation: the bug. Task: resolve it. Action: your debugging approach. Result: root cause found.");
  }

  add("Career Direction",
    isStudent ? "Your skills span multiple areas (web dev, ML, security). How are you deciding what to focus on after graduation?"
             : "Where do you see yourself in 2-3 years, and how does this role fit?",
    "It's okay to be exploring — show you've thought about it rather than picking randomly.");

  add("Values & Culture",
    "What does your ideal work environment look like? What team culture helps you do your best work?",
    "Be genuine — describe specific things (code reviews, mentorship, autonomy) rather than generic phrases.");

  return qs;
}

const HR_FALLBACKS = [
  { category: "Motivation", question: "What interests you most about this role and our company?", starNote: "Research the company beforehand. Connect their mission to your goals." },
  { category: "Teamwork", question: "Tell me about a time you helped a teammate who was struggling.", starNote: "Shows empathy and collaborative spirit." },
  { category: "Communication", question: "Describe presenting a technical idea to a non-technical audience.", starNote: "Clear communication is a top skill employers screen for." },
  { category: "Adaptability", question: "Tell me about quickly learning something unfamiliar under pressure.", starNote: "Show your learning process, not just the outcome." },
  { category: "Problem Solving", question: "Walk me through breaking a large problem into smaller steps.", starNote: "Structured thinking is what interviewers evaluate." },
];

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------
function generateSuggestions(text, lower, scores) {
  const high = [], medium = [], low = [];

  if (!lower.includes("summary") && !lower.includes("objective"))
    high.push("Add a Professional Summary (2-3 lines): State your background, key strengths, and target role. This frames the entire resume.");
  if (!/\d+%/.test(text) && !/\$\d/.test(text) && !/\d+x/i.test(text))
    high.push("Quantify your achievements: Add metrics like 'Improved performance by 40%', '10K concurrent users', or '95% accuracy'.");
  if (!text.includes("•") && !text.includes("- ") && !text.includes("* "))
    high.push("Use bullet points for experience and project descriptions. Walls of text are nearly impossible to scan quickly.");
  if (text.split("\n").filter((l) => l.trim()).length < 20)
    high.push("Expand your resume content — it appears sparse. Add project descriptions, skills, or relevant coursework.");
  if (!lower.includes("certif") && !lower.includes("certified"))
    high.push("Add certifications if you have any. Even 'In Progress' signals initiative.");

  if (!lower.includes("coursework") && !lower.includes("relevant course"))
    medium.push("Add Relevant Coursework: List 4-6 courses that map to your target role. Helps with ATS matching.");
  if (!lower.includes("leadership") && !lower.includes("club") && !lower.includes("volunteer") && !lower.includes("organiz"))
    medium.push("Add extracurriculars: hackathons, coding clubs, open-source contributions, or community involvement.");
  if (scores.dimensions[2].score < 7)
    medium.push("Restructure your skills section: Group by category (Languages, Frameworks, Cloud, ML) instead of comma-separated lists.");
  if (!lower.includes("award") && !lower.includes("honor") && !lower.includes("dean") && !lower.includes("scholarship"))
    medium.push("Include academic achievements: Dean's List, scholarships, hackathon rankings, or competition results.");
  medium.push("Make GitHub links clickable: Replace plain-text 'Github Code' labels with actual hyperlinks.");
  if (lower.includes("project") && !text.includes("http"))
    medium.push("Add live demo or repository links to your projects. Verifiable output is the strongest signal on a resume.");

  low.push("Group skills by proficiency: 'Proficient: Python, Java' vs 'Familiar: C, PHP'. Signals honest self-assessment.");
  low.push("Add a 'Blog / Talks' section: If you've written about your projects, link it — shows communication + depth.");
  low.push("Tailor the resume order for each application: Put the most relevant section first depending on the role.");
  if (scores.overall >= 7)
    low.push("Your resume is solid. For the final polish, ask a friend to do a 10-second scan and tell you what stands out.");

  return { high, medium, low };
}

// ---------------------------------------------------------------------------
// Catch-all: serve frontend
// ---------------------------------------------------------------------------
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "dist", "index.html"));
});

// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n🎯 AI Interview Coach server running at http://localhost:${PORT}\n`);
});
