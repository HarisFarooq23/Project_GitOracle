# 🌍 GitOracle — Open Source Effort Intelligence & Repository Search Engine

GitOracle is a **data-driven repository intelligence system** that helps developers discover, filter, and evaluate GitHub projects using **effort estimation, hybrid search, and structured filtering** over a dataset of **1.8M+ repositories**.

> “Before you start a GitHub project, know not just what it is — but how hard it will be.”

---

## 🚀 Core Idea

Unlike traditional GitHub search, GitOracle transforms raw repository metadata into a **decision-making engine** by combining:

- Hybrid search (keyword + filters)
- Time-based difficulty estimation (heuristic model)
- Topic + language intelligence
- Saved user-specific repositories
- Issue-label awareness

---

# 🌟 Features

## 🔍 Hybrid Repository Search Engine

Search repositories using structured filters:

- Language (Python, JS, Java, etc.)
- Topic (Backend, ML, DevOps, etc.)
- Star range
- Keyword search
- Time availability (1–3h, 5–10h, 20h+)

Built for **1.8M+ records with indexed PostgreSQL queries**.

---

## ⏱️ Time-Based Effort Estimation (Heuristic Model)

GitOracle does NOT rely on a real “time to fix” field.

Instead, it uses a **computed scoring system** based on:

- ⭐ Stars (proxy for repo scale/complexity)
- 🏷 Issue labels (good-first-issue, bug, refactor, documentation)
- 📦 Repository metadata (language, topics)

### Time Mapping:

- **1–3 hours** → beginner-friendly repos (low complexity score)
- **5–10 hours** → moderate difficulty tasks
- **20+ hours** → large-scale or complex systems

---

## 🧠 Complexity Scoring Engine

Each repository is assigned a **dynamic difficulty score** using:

- Repository popularity (stars)
- Issue label signals
- Topic relevance
- Language complexity weight

This score is used for ranking and filtering results efficiently.

---

## ⚡ High-Performance Search System

To handle large-scale data (1.8M repos), GitOracle uses:

- PostgreSQL indexing (stars, language, topics)
- Filter-first query optimization
- JOIN optimization (repository_topics mapping table)
- Limited dataset scoring (pre-filter before ranking)
- Removal of full-table scans

---

## 💾 User-Specific Saved Repositories

- Users can save repositories
- Each user sees ONLY their saved data
- Backed by `saved_repositories` table

### Features:

- Fast retrieval via indexed user_id
- Ordered by save time
- Clean personalized dashboard

---

## 🏷 Topic Intelligence System

Repositories are enriched using:

- `repo_topics`
- `repository_topics` (many-to-many mapping)

Enables advanced filtering like:

- Backend
- Machine Learning
- Systems Programming
- DevOps

---

## 📊 Dashboard

Each repository shows:

- ⭐ Stars
- 🧠 Difficulty score
- ⏱ Estimated effort category
- 💻 Language
- 📎 GitHub link
- 🏷 Topics

---

## 🔄 Data Pipeline (Dual Source Ingestion)

GitOracle uses two data sources:

### 1. Kaggle Dataset Pipeline

- Loads 1.8M repository dataset
- Cleans + normalizes data
- Bulk inserts into PostgreSQL

### 2. GitHub API Sync

- Fetches live repository metadata
- Fetches issues + labels
- Keeps dataset updated

---

## 🧪 Performance Engineering

### Why previous timeouts happened:

- Full-table scans on 1.8M rows
- JOIN executed before filtering
- Scoring applied on entire dataset
- Missing indexes

### Fixes implemented:

- Index-based filtering
- Filter-first SQL design
- Batch LIMIT before JOIN
- Reduced computation scope

---

## 🧱 System Architecture

### Frontend (Node.js + TypeScript)

- Search UI
- Filters (language, topic, time, stars)
- Saved repository dashboard

### Backend (Flask)

- `/api/search` hybrid search engine
- `/api/saved-repos` user-specific endpoint
- GitHub API integration
- Scoring engine

### Database (PostgreSQL)

- repositories
- repo_topics
- repository_topics
- issues
- issue_labels
- saved_repositories
- users

---

## 🧠 Data Flow

1. User enters filters  
2. Frontend sends structured request  
3. Flask builds optimized SQL query  
4. PostgreSQL executes indexed search  
5. Optional scoring applied in Python  
6. Results returned and rendered  

---

## ⚠️ Known Tradeoffs

- Time estimation is heuristic, not real-time measured  
- Scoring model is rule-based (not ML-based yet)  
- Accuracy depends on issue label quality  
- Requires indexing for optimal performance  

---

## 🚀 Future Improvements

- ML-based repository difficulty prediction  
- Semantic search (embedding-based ranking)  
- Redis caching layer for hot queries  
- Personalized recommendation engine  
- Real-time GitHub sync worker  
- Infinite scroll + pagination optimization  

---

## 🎯 Goal

To transform GitHub exploration from:

> “random searching and guessing”

into:

> structured, intelligent, effort-aware discovery of open-source projects

--------------

Any required dependencies can be installed directly from 
cd UI
npm install 

But there need be .env with firebase credentials path which github doesnt allow to commit since they are sensitive details and have to be stored locally . 
