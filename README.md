# GitGrade (UnsaidTalks Hackathon) — Recruiter-Grade GitHub Repository Analyzer

GitGrade is a recruiter-focused web app that analyzes any public GitHub repository and produces a **Score (0–100)**, a detailed multi-section review, visual dashboards, and a prioritized improvement roadmap. [file:33]

> Theme: AI + Code Analysis + Developer Profiling (GitGrade Hackathon). [file:33]

---

## Live Demo
- App: 
- Demo video: 

---

## What it does
Paste a public GitHub repository URL and GitGrade will automatically:
- Fetch repository metadata, file tree, README (if present), languages, and commit activity (public data).
- Score the repository across key engineering dimensions.
- Generate a recruiter-friendly report: strengths, risks, and concrete next steps.
- Show visual representations (charts) so recruiters can decide quickly. [file:33]

---

## Core Outputs
GitGrade generates three primary outputs for every repository:
1. **Score / Rating** (0–100)
2. **Written Summary** (high-signal executive overview)
3. **Personalized Roadmap** (prioritized action items to improve the repo) [file:33]

Additionally, it provides a **visual dashboard** (radar chart + other charts) to make evaluation fast and understandable.

---

## Scoring Dimensions
The scoring model evaluates:
- **Code quality & readability**
- **Project structure & organization**
- **Documentation quality**
- **Testing & maintainability**
- **Commit consistency**
- **Real-world relevance** [file:33]

### Weighted Score Formula
Overall score is computed from dimension scores (each 0–100):

\[
S = 0.25C + 0.20P + 0.20D + 0.15T + 0.15H + 0.05R
\]

Where:
- \(C\) = Code Quality
- \(P\) = Project Structure
- \(D\) = Documentation
- \(T\) = Tests
- \(H\) = Commit History / Consistency
- \(R\) = Real‑World Relevance

> Note: Some metrics are heuristics to keep the solution fast and robust within hackathon constraints.

---

## Visualizations (Recruiter Dashboard)
The dashboard includes (minimum):
- Overall Score (donut / gauge)
- 6-dimension Radar chart
- Commit consistency timeline (line chart)
- File type distribution (bar/pie)

> Built to support recruiter decision-making at a glance (signal-first UI, progressive disclosure).

---

## Tech Stack
- **HTML5 / CSS3 / Vanilla JavaScript**
- **Chart.js** for charts (CDN)
- **GitHub REST API** via `fetch()` (public data)
- Hosting: **Vercel** (recommended) or **GitHub Pages**

---

## Project Structure
Minimal (hackathon-optimized):
