-- DANGER: This wipes existing tables to apply your new clean schema
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

-- ────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ═══════════════════════════════════════════════════════════
-- LAYER 1: USER LAYER
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS user_profiles (
    profile_id SERIAL PRIMARY KEY,
    user_id INT UNIQUE NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    full_name VARCHAR(100),
    github_username VARCHAR(50),
    experience_level VARCHAR(20)
        CHECK (experience_level IN ('beginner','intermediate','advanced','expert')),
    available_hours NUMERIC(4,1),
    bio TEXT,
    avatar_path VARCHAR(255),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skills (
    skill_id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(50),
    parent_id INT REFERENCES skills(skill_id)
);

CREATE TABLE IF NOT EXISTS user_skills (
    user_skill_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    skill_id INT NOT NULL REFERENCES skills(skill_id),
    proficiency SMALLINT CHECK (proficiency BETWEEN 1 AND 5),
    UNIQUE(user_id, skill_id)
);

CREATE TABLE IF NOT EXISTS user_availability (
    availability_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    day_of_week VARCHAR(10),
    hours_available NUMERIC(3,1)
);

CREATE TABLE IF NOT EXISTS user_activity (
    activity_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    entered_webapp_at TIMESTAMP NOT NULL DEFAULT NOW(),
    left_webapp_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_entered ON user_activity(user_id, entered_webapp_at DESC);

-- ═══════════════════════════════════════════════════════════
-- LAYER 2: REPOSITORY LAYER
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS repositories (
    repo_id SERIAL PRIMARY KEY,
    github_id BIGINT UNIQUE NOT NULL,
    owner VARCHAR(100) NOT NULL,
    name VARCHAR(100) NOT NULL,
    full_name VARCHAR(200) UNIQUE NOT NULL,
    description TEXT,
    stars INT DEFAULT 0,
    forks INT DEFAULT 0,
    language VARCHAR(50),
    html_url VARCHAR(300),
    image_path VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS repo_topics (
    topic_id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS repository_topics (
    repo_id INT NOT NULL REFERENCES repositories(repo_id) ON DELETE CASCADE,
    topic_id INT NOT NULL REFERENCES repo_topics(topic_id),
    PRIMARY KEY (repo_id, topic_id)
);

-- ═══════════════════════════════════════════════════════════
-- LAYER 3: ISSUE LAYER
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS issues (
    issue_id SERIAL PRIMARY KEY,
    github_issue_id BIGINT UNIQUE NOT NULL,
    repo_id INT NOT NULL REFERENCES repositories(repo_id),
    title VARCHAR(500) NOT NULL,
    body TEXT,
    state VARCHAR(20) DEFAULT 'open'
        CHECK (state IN ('open','closed')),
    complexity_score NUMERIC(3,1)
        CHECK (complexity_score BETWEEN 1 AND 10),
    estimated_time_hours NUMERIC(5,1),
    github_url VARCHAR(300),
    screenshot_path VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS issue_labels (
    label_id SERIAL PRIMARY KEY,
    issue_id INT NOT NULL REFERENCES issues(issue_id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(10),
    UNIQUE(issue_id, name)
);

CREATE TABLE IF NOT EXISTS bounty_skills (
    bounty_skill_id SERIAL PRIMARY KEY,
    issue_id INT NOT NULL REFERENCES issues(issue_id) ON DELETE CASCADE,
    skill_id INT NOT NULL REFERENCES skills(skill_id),
    required_level SMALLINT CHECK (required_level BETWEEN 1 AND 5),
    UNIQUE(issue_id, skill_id)
);

-- ═══════════════════════════════════════════════════════════
-- LAYER 4: INTERACTION LAYER
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS assignments (
    assignment_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id),
    issue_id INT NOT NULL REFERENCES issues(issue_id),
    status VARCHAR(20) DEFAULT 'claimed'
        CHECK (status IN ('claimed','in_progress','completed','abandoned')),
    claimed_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    actual_hours NUMERIC(5,1),
    UNIQUE(user_id, issue_id)
);

CREATE TABLE IF NOT EXISTS saved_repositories (
    user_id INT NOT NULL REFERENCES users(user_id),
    repo_id INT NOT NULL REFERENCES repositories(repo_id),
    saved_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, repo_id)
);

CREATE TABLE IF NOT EXISTS user_activity_logs (
    log_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id),
    action VARCHAR(100) NOT NULL,
    entity VARCHAR(50)
        CHECK (entity IN ('issue','assignment','user')),
    entity_id INT,
    logged_at TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- LAYER 5: INTELLIGENCE LAYER
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS recommendations (
    rec_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id),
    issue_id INT NOT NULL REFERENCES issues(issue_id),
    score NUMERIC(5,2),
    reason TEXT,
    generated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, issue_id)
);

CREATE TABLE IF NOT EXISTS prediction_logs (
    pred_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(user_id),
    issue_id INT REFERENCES issues(issue_id),
    predicted_hours NUMERIC(5,1),
    actual_hours NUMERIC(5,1),
    error_margin NUMERIC(5,2),
    logged_at TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- LAYER 6: ARCHIVAL LAYER
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS archive_issues (
    archive_id SERIAL PRIMARY KEY,
    original_id INT,
    data JSONB,
    archived_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS archive_assignments (
    archive_id SERIAL PRIMARY KEY,
    original_id INT,
    data JSONB,
    archived_at TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trg_update_issue_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_issue_updated
BEFORE UPDATE ON issues
FOR EACH ROW EXECUTE FUNCTION trg_update_issue_timestamp();

CREATE OR REPLACE FUNCTION trg_update_profile_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profile_updated
BEFORE UPDATE ON user_profiles
FOR EACH ROW EXECUTE FUNCTION trg_update_profile_timestamp();

-- ═══════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION calculate_match_score(p_user_id INT, p_issue_id INT)
RETURNS NUMERIC LANGUAGE plpgsql AS $$
DECLARE
    v_score NUMERIC := 0;
    v_count INT := 0;
    v_prof INT;
    v_required INT;
    v_skill_id INT;
BEGIN
    FOR v_skill_id, v_required IN
        SELECT skill_id, required_level FROM bounty_skills WHERE issue_id = p_issue_id
    LOOP
        SELECT proficiency INTO v_prof
        FROM user_skills
        WHERE user_id = p_user_id AND skill_id = v_skill_id;

        IF FOUND THEN
            v_score := v_score + LEAST((v_prof::NUMERIC / NULLIF(v_required,0)) * 20, 20);
        END IF;

        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN RETURN 0; END IF;
    RETURN ROUND(v_score / v_count, 2);
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- PROCEDURES (DUAL: FLASK + DEMO)
-- ═══════════════════════════════════════════════════════════

-- Flask-safe
CREATE OR REPLACE PROCEDURE claim_issue(p_user_id INT, p_issue_id INT)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO assignments(user_id, issue_id, status, claimed_at)
    VALUES (p_user_id, p_issue_id, 'claimed', NOW());
END;
$$;

-- Demo (with COMMIT)
CREATE OR REPLACE PROCEDURE claim_issue_demo(p_user_id INT, p_issue_id INT)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO assignments(user_id, issue_id, status, claimed_at)
    VALUES (p_user_id, p_issue_id, 'claimed', NOW());
    COMMIT;
END;
$$;






-------------------------------------------------------------------------------------------------------------------
-- Sections:
--   A.  Data Linking & Validation        (Q01-Q06)
--   B.  Repository Queries               (Q07-Q12)
--   C.  Issue Queries                    (Q13-Q18)
--   D.  User & Skill Queries             (Q19-Q23)
--   E.  Recommendation & Matching        (Q24-Q27)
--   F.  Assignment / Interaction         (Q28-Q32)
--   G.  Reporting & Analytics            (Q33-Q38)
--   H.  Data Consistency & Maintenance   (Q39-Q43)
--   I.  Sample Insert / Test Data        (Q44-Q50)
--   J.  Complex Query (Subquery + JOIN)  (Q51)
--   K.  Transaction Example              (Q52)
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- A. DATA LINKING & VALIDATION
-- ════════════════════════════════════════════════════════════

-- Q01: Repositories successfully linked to GitHub API
--      (have a real github_id, not a surrogate hashtext value)
SELECT
    repo_id,
    github_id,
    full_name,
    owner,
    name,
    stars,
    forks,
    language,
    html_url
FROM repositories
WHERE github_id <> abs(hashtext(full_name))
ORDER BY stars DESC
LIMIT 25;


-- Q02: Kaggle repos still UNLINKED (surrogate github_id, no API match yet)
SELECT
    repo_id,
    full_name,
    owner,
    name,
    stars,
    language
FROM repositories
WHERE github_id = abs(hashtext(full_name))
ORDER BY stars DESC
LIMIT 25;


-- Q03: Find duplicate repository names across different owners
SELECT
    LOWER(name)                             AS repo_name,
    COUNT(*)                                AS copies,
    STRING_AGG(full_name, ' | '
               ORDER BY full_name)          AS all_full_names,
    STRING_AGG(stars::TEXT, ' | '
               ORDER BY full_name)          AS all_stars
FROM repositories
GROUP BY LOWER(name)
HAVING COUNT(*) > 1
ORDER BY copies DESC, repo_name;


-- Q04: Repositories with NO issues ingested yet
SELECT
    r.repo_id,
    r.full_name,
    r.stars,
    r.language,
    r.html_url
FROM repositories r
LEFT JOIN issues i ON i.repo_id = r.repo_id
WHERE i.issue_id IS NULL
ORDER BY r.stars DESC
LIMIT 30;


-- Q05: Repositories with topics (linked via repository_topics)
SELECT
    r.full_name,
    r.stars,
    r.language,
    STRING_AGG(rt.name, ', ' ORDER BY rt.name) AS topics
FROM repositories r
JOIN repository_topics rit ON rit.repo_id  = r.repo_id
JOIN repo_topics       rt  ON rt.topic_id  = rit.topic_id
GROUP BY r.repo_id, r.full_name, r.stars, r.language
ORDER BY r.stars DESC
LIMIT 20;


-- Q06: Repositories with NO topics attached
SELECT
    r.full_name,
    r.stars,
    r.language
FROM repositories r
LEFT JOIN repository_topics rit ON rit.repo_id = r.repo_id
WHERE rit.repo_id IS NULL
ORDER BY r.stars DESC
LIMIT 20;


-- ════════════════════════════════════════════════════════════
-- B. REPOSITORY QUERIES
-- ════════════════════════════════════════════════════════════

-- Q07: Top 20 repositories by stars with GitHub link
SELECT
    repo_id,
    full_name,
    html_url,
    stars,
    forks,
    language,
    description
FROM repositories
ORDER BY stars DESC
LIMIT 20;


-- Q08: Filter by language AND minimum stars
SELECT
    full_name,
    html_url,
    stars,
    forks,
    description
FROM repositories
WHERE LOWER(language) = 'python'     -- replace with any language
  AND stars >= 10000
ORDER BY stars DESC;


-- Q09: Trending repositories (high stars, created in last 2 years)
SELECT
    full_name,
    html_url,
    stars,
    forks,
    language,
    created_at
FROM repositories
WHERE created_at >= NOW() - INTERVAL '2 years'
ORDER BY stars DESC
LIMIT 20;


-- Q10: Repositories grouped by language with aggregate stats
SELECT
    LOWER(language)              AS language,
    COUNT(*)                     AS total_repos,
    SUM(stars)                   AS total_stars,
    ROUND(AVG(stars),   0)       AS avg_stars,
    ROUND(AVG(forks),   0)       AS avg_forks,
    MAX(stars)                   AS max_stars
FROM repositories
WHERE language IS NOT NULL
GROUP BY LOWER(language)
ORDER BY total_stars DESC
LIMIT 20;


-- Q11: Repositories with the most open issues
SELECT
    r.full_name,
    r.html_url,
    r.stars,
    r.language,
    COUNT(i.issue_id)            AS open_issue_count
FROM repositories r
JOIN issues i ON i.repo_id = r.repo_id
             AND i.state   = 'open'
GROUP BY r.repo_id, r.full_name, r.html_url, r.stars, r.language
ORDER BY open_issue_count DESC
LIMIT 20;


-- Q12: Search repositories by name (partial match)
SELECT
    full_name,
    html_url,
    stars,
    language,
    description
FROM repositories
WHERE LOWER(name) LIKE '%flask%'     -- replace with any keyword
ORDER BY stars DESC
LIMIT 15;


-- ════════════════════════════════════════════════════════════
-- C. ISSUE QUERIES
-- ════════════════════════════════════════════════════════════

-- Q13: All open issues joined with repository info
SELECT
    i.issue_id,
    i.github_issue_id,
    r.full_name                  AS repository,
    r.language,
    r.html_url                   AS repo_link,
    i.title,
    i.github_url                 AS issue_link,
    i.complexity_score,
    i.estimated_time_hours,
    i.created_at
FROM issues i
JOIN repositories r ON r.repo_id = i.repo_id
WHERE i.state = 'open'
ORDER BY i.created_at DESC
LIMIT 30;


-- Q14: Issues with their labels
SELECT
    i.issue_id,
    i.title,
    i.github_url,
    r.full_name                  AS repository,
    STRING_AGG(
        il.name || COALESCE(' (#' || il.color || ')', ''),
        ', ' ORDER BY il.name
    )                            AS labels
FROM issues i
JOIN repositories r ON r.repo_id  = i.repo_id
LEFT JOIN issue_labels il ON il.issue_id = i.issue_id
WHERE i.state = 'open'
GROUP BY i.issue_id, i.title, i.github_url, r.full_name
ORDER BY i.created_at DESC
LIMIT 25;


-- Q15: Issues with required skills (via bounty_skills)
SELECT
    i.issue_id,
    i.title,
    i.github_url,
    r.full_name                  AS repository,
    i.complexity_score,
    i.estimated_time_hours,
    STRING_AGG(
        s.name || ' (lvl ' || bs.required_level || ')',
        ', ' ORDER BY bs.required_level DESC
    )                            AS required_skills
FROM issues i
JOIN repositories  r  ON r.repo_id  = i.repo_id
JOIN bounty_skills bs ON bs.issue_id = i.issue_id
JOIN skills        s  ON s.skill_id  = bs.skill_id
WHERE i.state = 'open'
GROUP BY i.issue_id, i.title, i.github_url, r.full_name,
         i.complexity_score, i.estimated_time_hours
ORDER BY i.complexity_score ASC NULLS LAST
LIMIT 25;


-- Q16: Issues filtered by complexity (good-first-issue range 1-3)
SELECT
    i.issue_id,
    i.title,
    i.github_url,
    r.full_name,
    r.language,
    i.complexity_score,
    i.estimated_time_hours
FROM issues i
JOIN repositories r ON r.repo_id = i.repo_id
WHERE i.state            = 'open'
  AND i.complexity_score BETWEEN 1 AND 3
ORDER BY i.complexity_score ASC, r.stars DESC
LIMIT 20;


-- Q17: Fuzzy title search on issues (pg_trgm)
--      Index used: idx_issues_title_trgm
SELECT
    i.issue_id,
    i.title,
    i.github_url,
    r.full_name,
    similarity(i.title, 'async support') AS relevance_score
FROM issues i
JOIN repositories r ON r.repo_id = i.repo_id
WHERE i.title % 'async support'
ORDER BY relevance_score DESC
LIMIT 15;


-- Q18: Issues closed in the last 30 days
SELECT
    i.issue_id,
    i.title,
    i.github_url,
    r.full_name,
    i.updated_at                 AS closed_at
FROM issues i
JOIN repositories r ON r.repo_id = i.repo_id
WHERE i.state      = 'closed'
  AND i.updated_at >= NOW() - INTERVAL '30 days'
ORDER BY i.updated_at DESC
LIMIT 20;


-- ════════════════════════════════════════════════════════════
-- D. USER & SKILL QUERIES
-- ════════════════════════════════════════════════════════════

-- Q19: Full user profile with skills
--      Replace 1 with target user_id.
SELECT
    u.user_id,
    u.username,
    u.email,
    up.full_name,
    up.github_username,
    up.experience_level,
    up.available_hours,
    up.bio,
    STRING_AGG(
        s.name || ' (' || us.proficiency || '/5)',
        ', ' ORDER BY us.proficiency DESC
    )                            AS skills
FROM users u
LEFT JOIN user_profiles up ON up.user_id  = u.user_id
LEFT JOIN user_skills   us ON us.user_id  = u.user_id
LEFT JOIN skills        s  ON s.skill_id  = us.skill_id
WHERE u.user_id = 1                       -- replace with target user_id
GROUP BY u.user_id, u.username, u.email,
         up.full_name, up.github_username,
         up.experience_level, up.available_hours, up.bio;


-- Q20: All users with a specific skill at minimum proficiency
SELECT
    u.user_id,
    u.username,
    up.experience_level,
    us.proficiency
FROM users u
JOIN user_profiles up ON up.user_id  = u.user_id
JOIN user_skills   us ON us.user_id  = u.user_id
JOIN skills        s  ON s.skill_id  = us.skill_id
WHERE LOWER(s.name)  = 'python'           -- replace with skill name
  AND us.proficiency >= 3
  AND u.is_active    = TRUE
ORDER BY us.proficiency DESC, u.username;


-- Q21: Users who are available and match a skill category
SELECT
    u.user_id,
    u.username,
    up.available_hours,
    up.experience_level,
    STRING_AGG(s.name, ', ' ORDER BY s.name) AS skills_in_category
FROM users u
JOIN user_profiles up ON up.user_id = u.user_id
                     AND up.available_hours > 0
JOIN user_skills   us ON us.user_id = u.user_id
JOIN skills        s  ON s.skill_id = us.skill_id
                     AND s.category = 'language'   -- replace with category
WHERE u.is_active = TRUE
GROUP BY u.user_id, u.username, up.available_hours, up.experience_level
ORDER BY up.available_hours DESC;


-- Q22: Skill hierarchy — child skills under a parent
SELECT
    p.name  AS parent_skill,
    p.category,
    c.skill_id,
    c.name  AS child_skill
FROM skills c
JOIN skills p ON p.skill_id = c.parent_id
ORDER BY p.name, c.name;


-- Q23: Weekly availability per user (total hours available)
SELECT
    u.username,
    up.experience_level,
    SUM(ua.hours_available) AS weekly_hours_available
FROM users u
JOIN user_profiles      up ON up.user_id = u.user_id
JOIN user_availability  ua ON ua.user_id = u.user_id
WHERE u.is_active = TRUE
GROUP BY u.user_id, u.username, up.experience_level
ORDER BY weekly_hours_available DESC;


-- ════════════════════════════════════════════════════════════
-- E. RECOMMENDATION & MATCHING
-- ════════════════════════════════════════════════════════════

-- Q24: Top recommended issues for a specific user
--      Replace 42 with the target user_id.
SELECT
    i.issue_id,
    i.title,
    i.github_url                              AS issue_link,
    r.full_name                               AS repository,
    r.html_url                                AS repo_link,
    r.language,
    i.complexity_score,
    i.estimated_time_hours,
    calculate_match_score(42, i.issue_id)     AS match_score,
    STRING_AGG(DISTINCT s.name, ', ')         AS required_skills
FROM issues i
JOIN repositories  r   ON r.repo_id  = i.repo_id
LEFT JOIN bounty_skills bs  ON bs.issue_id = i.issue_id
LEFT JOIN skills        s   ON s.skill_id  = bs.skill_id
WHERE i.state = 'open'
  AND i.issue_id NOT IN (
      SELECT issue_id FROM assignments WHERE user_id = 42
  )
  AND user_has_time(42, i.issue_id) = TRUE
  AND i.complexity_score <= (
      SELECT CASE experience_level
                 WHEN 'beginner'     THEN 3
                 WHEN 'intermediate' THEN 6
                 WHEN 'advanced'     THEN 8
                 WHEN 'expert'       THEN 10
             END
      FROM user_profiles
      WHERE user_id = 42
  )
GROUP BY i.issue_id, i.title, i.github_url,
         r.full_name, r.html_url, r.language,
         i.complexity_score, i.estimated_time_hours
HAVING calculate_match_score(42, i.issue_id) > 0
ORDER BY match_score DESC
LIMIT 10;


-- Q25: Pre-computed recommendations from the recommendations table
SELECT
    u.username,
    r.full_name                  AS repository,
    i.title                      AS issue_title,
    i.github_url                 AS issue_link,
    i.complexity_score,
    rec.score,
    rec.reason,
    rec.generated_at
FROM recommendations rec
JOIN users        u ON u.user_id  = rec.user_id
JOIN issues       i ON i.issue_id = rec.issue_id
JOIN repositories r ON r.repo_id  = i.repo_id
WHERE rec.user_id = 42                    -- replace with target user_id
ORDER BY rec.score DESC
LIMIT 15;


-- Q26: Issues matching a user's skills (manual skill-overlap query)
SELECT
    i.issue_id,
    i.title,
    i.github_url,
    r.full_name,
    r.language,
    i.complexity_score,
    COUNT(DISTINCT bs.skill_id)                          AS matched_skill_count,
    STRING_AGG(DISTINCT s.name, ', ' ORDER BY s.name)   AS matched_skills
FROM issues i
JOIN repositories  r  ON r.repo_id  = i.repo_id
JOIN bounty_skills bs ON bs.issue_id = i.issue_id
JOIN user_skills   us ON us.skill_id = bs.skill_id
                     AND us.user_id  = 42               -- replace user_id
                     AND us.proficiency >= bs.required_level
JOIN skills        s  ON s.skill_id  = bs.skill_id
WHERE i.state = 'open'
GROUP BY i.issue_id, i.title, i.github_url,
         r.full_name, r.language, i.complexity_score
ORDER BY matched_skill_count DESC, r.stars DESC
LIMIT 20;


-- Q27: Prediction accuracy report
SELECT
    u.username,
    COUNT(*)                                             AS total_predictions,
    ROUND(AVG(pl.predicted_hours), 1)                   AS avg_predicted_hours,
    ROUND(AVG(pl.actual_hours),    1)                   AS avg_actual_hours,
    ROUND(AVG(pl.error_margin),    2)                   AS avg_error_margin,
    ROUND(MIN(pl.error_margin),    2)                   AS best_prediction,
    ROUND(MAX(pl.error_margin),    2)                   AS worst_prediction
FROM prediction_logs pl
JOIN users u ON u.user_id = pl.user_id
GROUP BY u.user_id, u.username
ORDER BY avg_error_margin ASC;


-- ════════════════════════════════════════════════════════════
-- F. ASSIGNMENT / INTERACTION
-- ════════════════════════════════════════════════════════════

-- Q28: All active assignments with full context
SELECT
    a.assignment_id,
    u.username,
    r.full_name                  AS repository,
    i.title                      AS issue_title,
    i.github_url,
    i.complexity_score,
    a.status,
    a.claimed_at,
    a.started_at,
    a.actual_hours
FROM assignments  a
JOIN users        u ON u.user_id  = a.user_id
JOIN issues       i ON i.issue_id = a.issue_id
JOIN repositories r ON r.repo_id  = i.repo_id
WHERE a.status IN ('claimed', 'in_progress')
ORDER BY a.claimed_at DESC;


-- Q29: Assignment history for a specific user (replace 42 with user_id)
SELECT
    a.assignment_id,
    r.full_name,
    i.title,
    i.github_url,
    a.status,
    a.claimed_at,
    a.completed_at,
    a.actual_hours,
    i.estimated_time_hours,
    ROUND(
        ABS(a.actual_hours - i.estimated_time_hours), 1
    )                            AS hour_delta
FROM assignments  a
JOIN issues       i ON i.issue_id = a.issue_id
JOIN repositories r ON r.repo_id  = i.repo_id
WHERE a.user_id = 42                      -- replace user_id
ORDER BY a.claimed_at DESC;


-- Q30: Count of assignments per status (dashboard metric)
SELECT
    status,
    COUNT(*) AS count
FROM assignments
GROUP BY status
ORDER BY CASE status
             WHEN 'in_progress' THEN 1
             WHEN 'claimed'     THEN 2
             WHEN 'completed'   THEN 3
             WHEN 'abandoned'   THEN 4
         END;


-- Q31: Repositories saved by a specific user (replace 42 with user_id)
SELECT
    r.full_name,
    r.html_url,
    r.stars,
    r.language,
    sr.saved_at
FROM saved_repositories sr
JOIN repositories r ON r.repo_id = sr.repo_id
WHERE sr.user_id = 42                     -- replace user_id
ORDER BY sr.saved_at DESC;


-- Q32: Recent activity log for a user (last 20 actions)
SELECT
    log_id,
    action,
    entity,
    entity_id,
    logged_at
FROM user_activity_logs
WHERE user_id = 42                        -- replace user_id
ORDER BY logged_at DESC
LIMIT 20;


-- ════════════════════════════════════════════════════════════
-- G. REPORTING & ANALYTICS
-- ════════════════════════════════════════════════════════════

-- Q33: Issues per language with open count and average complexity
SELECT
    r.language,
    COUNT(DISTINCT r.repo_id)            AS repos,
    COUNT(i.issue_id)                    AS open_issues,
    ROUND(AVG(i.complexity_score), 1)    AS avg_complexity,
    ROUND(AVG(i.estimated_time_hours), 1) AS avg_est_hours
FROM repositories r
LEFT JOIN issues i ON i.repo_id = r.repo_id
                  AND i.state   = 'open'
WHERE r.language IS NOT NULL
GROUP BY r.language
ORDER BY open_issues DESC;


-- Q34: Most requested skills (across all bounty_skills rows)
SELECT
    s.name                       AS skill,
    s.category,
    COUNT(bs.bounty_skill_id)    AS times_required,
    ROUND(AVG(bs.required_level), 1) AS avg_required_level
FROM bounty_skills bs
JOIN skills s ON s.skill_id = bs.skill_id
GROUP BY s.skill_id, s.name, s.category
ORDER BY times_required DESC;


-- Q35: User leaderboard — most completed assignments
SELECT
    u.username,
    up.experience_level,
    COUNT(a.assignment_id)       AS completed_count,
    ROUND(SUM(a.actual_hours), 1) AS total_hours_contributed,
    ROUND(AVG(a.actual_hours), 1) AS avg_hours_per_issue
FROM assignments  a
JOIN users        u  ON u.user_id  = a.user_id
JOIN user_profiles up ON up.user_id = a.user_id
WHERE a.status = 'completed'
GROUP BY u.user_id, u.username, up.experience_level
ORDER BY completed_count DESC
LIMIT 10;


-- Q36: Repositories with the most unique contributors
SELECT
    r.full_name,
    r.html_url,
    r.stars,
    COUNT(DISTINCT a.user_id)    AS unique_contributors
FROM repositories r
JOIN issues       i ON i.repo_id  = r.repo_id
JOIN assignments  a ON a.issue_id = i.issue_id
                   AND a.status   = 'completed'
GROUP BY r.repo_id, r.full_name, r.html_url, r.stars
ORDER BY unique_contributors DESC
LIMIT 15;


-- Q37: Topic popularity — most-used topics across all repos
SELECT
    rt.name                      AS topic,
    COUNT(rit.repo_id)           AS repo_count,
    SUM(r.stars)                 AS total_stars_in_topic
FROM repo_topics       rt
JOIN repository_topics rit ON rit.topic_id = rt.topic_id
JOIN repositories      r   ON r.repo_id    = rit.repo_id
GROUP BY rt.topic_id, rt.name
ORDER BY repo_count DESC
LIMIT 20;


-- Q38: Monthly issue creation trend (last 12 months)
SELECT
    DATE_TRUNC('month', i.created_at)   AS month,
    COUNT(*)                             AS new_issues
FROM issues i
WHERE i.created_at >= NOW() - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', i.created_at)
ORDER BY month ASC;


-- ════════════════════════════════════════════════════════════
-- H. DATA CONSISTENCY & MAINTENANCE
-- ════════════════════════════════════════════════════════════

-- Q39: Orphaned issues (repo_id points to deleted repository)
SELECT i.issue_id, i.github_issue_id, i.title
FROM issues i
LEFT JOIN repositories r ON r.repo_id = i.repo_id
WHERE r.repo_id IS NULL;


-- Q40: Orphaned bounty_skills (issue deleted, rows remain)
SELECT bs.bounty_skill_id, bs.issue_id, bs.skill_id
FROM bounty_skills bs
LEFT JOIN issues i ON i.issue_id = bs.issue_id
WHERE i.issue_id IS NULL;


-- Q41: Issues with invalid github_url format
SELECT issue_id, github_issue_id, title, github_url
FROM issues
WHERE github_url IS NOT NULL
  AND github_url NOT LIKE 'https://github.com/%';


-- Q42: Repositories with malformed html_url
SELECT repo_id, full_name, html_url
FROM repositories
WHERE html_url IS NOT NULL
  AND html_url NOT LIKE 'https://github.com/%';


-- Q43: Assignments stuck in 'in_progress' for over 30 days
SELECT
    a.assignment_id,
    u.username,
    i.title,
    r.full_name,
    a.started_at,
    NOW() - a.started_at         AS stuck_for
FROM assignments  a
JOIN users        u ON u.user_id  = a.user_id
JOIN issues       i ON i.issue_id = a.issue_id
JOIN repositories r ON r.repo_id  = i.repo_id
WHERE a.status     = 'in_progress'
  AND a.started_at < NOW() - INTERVAL '30 days'
ORDER BY a.started_at ASC;


-- ════════════════════════════════════════════════════════════
-- I. SAMPLE INSERT / TEST DATA  (run after schema.sql seed)
-- ════════════════════════════════════════════════════════════

-- Q44: Insert a test repository (simulates Kaggle row with surrogate id)
INSERT INTO repositories (github_id, owner, name, full_name, description,
                          stars, forks, language, html_url)
VALUES (
    abs(hashtext('pallets/flask')),
    'pallets',
    'flask',
    'pallets/flask',
    'The Python micro framework for building web applications.',
    67000, 26000, 'python',
    'https://github.com/pallets/flask'
)
ON CONFLICT (full_name) DO UPDATE SET
    stars    = EXCLUDED.stars,
    forks    = EXCLUDED.forks,
    language = EXCLUDED.language;


-- Q45: Insert a test repository from GitHub API (real github_id)
INSERT INTO repositories (github_id, owner, name, full_name, description,
                          stars, forks, language, html_url)
VALUES (
    596892,
    'facebook',
    'react',
    'facebook/react',
    'The library for web and native user interfaces.',
    225000, 46000, 'javascript',
    'https://github.com/facebook/react'
)
ON CONFLICT (full_name) DO UPDATE SET
    github_id = EXCLUDED.github_id,
    stars     = EXCLUDED.stars,
    forks     = EXCLUDED.forks;


-- Q46: Insert a topic and link it to a repository
INSERT INTO repo_topics (name) VALUES ('web-framework') ON CONFLICT (name) DO NOTHING;

INSERT INTO repository_topics (repo_id, topic_id)
SELECT r.repo_id, rt.topic_id
FROM   repositories r, repo_topics rt
WHERE  r.full_name  = 'pallets/flask'
  AND  rt.name      = 'web-framework'
ON CONFLICT DO NOTHING;


-- Q47: Insert a test issue
INSERT INTO issues (github_issue_id, repo_id, title, body, state,
                    complexity_score, estimated_time_hours, github_url)
SELECT
    100001,
    r.repo_id,
    'Add async support for request handlers',
    'Currently the request lifecycle is fully synchronous. This issue tracks adding native async/await support.',
    'open',
    4.5,
    8.0,
    'https://github.com/pallets/flask/issues/100001'
FROM repositories r
WHERE r.full_name = 'pallets/flask'
ON CONFLICT (github_issue_id) DO NOTHING;


-- Q48: Insert issue label
INSERT INTO issue_labels (issue_id, name, color)
SELECT i.issue_id, 'enhancement', '84b6eb'
FROM   issues i
WHERE  i.github_issue_id = 100001
ON CONFLICT (issue_id, name) DO NOTHING;


-- Q49: Tag the issue as requiring Python skill (level 3)
INSERT INTO bounty_skills (issue_id, skill_id, required_level)
SELECT i.issue_id, s.skill_id, 3
FROM   issues  i
JOIN   skills  s ON LOWER(s.name) = 'python'
WHERE  i.github_issue_id = 100001
ON CONFLICT (issue_id, skill_id) DO NOTHING;


-- Q50: Insert a test user with profile and skills
INSERT INTO users (username, email, password_hash)
VALUES ('alice_dev', 'alice@example.com', 'hashed_password_here')
ON CONFLICT (username) DO NOTHING;

INSERT INTO user_profiles (user_id, full_name, github_username,
                           experience_level, available_hours, bio)
SELECT user_id, 'Alice Developer', 'alice-dev',
       'intermediate', 20.0, 'Open source contributor, loves Python and web frameworks.'
FROM   users
WHERE  username = 'alice_dev'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO user_skills (user_id, skill_id, proficiency)
SELECT u.user_id, s.skill_id, 4
FROM   users u, skills s
WHERE  u.username    = 'alice_dev'
  AND  LOWER(s.name) = 'python'
ON CONFLICT (user_id, skill_id) DO UPDATE SET proficiency = EXCLUDED.proficiency;


-- ════════════════════════════════════════════════════════════
-- J. COMPLEX QUERY  (Multi-join + subquery)
-- ════════════════════════════════════════════════════════════

-- Q51: Full recommendation query for user_id = 42
SELECT
    i.issue_id,
    i.title,
    i.github_url                              AS issue_link,
    r.full_name                               AS repository,
    r.html_url                                AS repo_link,
    r.language,
    r.stars,
    i.complexity_score,
    i.estimated_time_hours,
    calculate_match_score(42, i.issue_id)     AS match_score,
    STRING_AGG(DISTINCT s.name, ', ')         AS required_skills,
    STRING_AGG(DISTINCT il.name, ', ')        AS labels
FROM issues i
JOIN repositories  r   ON r.repo_id  = i.repo_id
LEFT JOIN bounty_skills bs  ON bs.issue_id = i.issue_id
LEFT JOIN skills        s   ON s.skill_id  = bs.skill_id
LEFT JOIN issue_labels  il  ON il.issue_id = i.issue_id
WHERE
    i.state = 'open'
    AND i.issue_id NOT IN (
        SELECT issue_id FROM assignments WHERE user_id = 42
    )
    AND user_has_time(42, i.issue_id) = TRUE
    AND COALESCE(i.complexity_score, 0) <= (
        SELECT CASE experience_level
                   WHEN 'beginner'     THEN 3
                   WHEN 'intermediate' THEN 6
                   WHEN 'advanced'     THEN 8
                   WHEN 'expert'       THEN 10
                   ELSE 10
               END
        FROM user_profiles WHERE user_id = 42
    )
GROUP BY
    i.issue_id, i.title, i.github_url,
    r.full_name, r.html_url, r.language, r.stars,
    i.complexity_score, i.estimated_time_hours
HAVING calculate_match_score(42, i.issue_id) > 0
ORDER BY match_score DESC, r.stars DESC
LIMIT 10;


-- ════════════════════════════════════════════════════════════
-- K. TRANSACTION EXAMPLE
-- ════════════════════════════════════════════════════════════

-- Q52: Mark an assignment completed and record the prediction log atomically.
BEGIN;

    UPDATE assignments
    SET
        status       = 'completed',
        completed_at = NOW(),
        actual_hours = 8.5
    WHERE user_id  = 42
      AND issue_id = 1
      AND status   IN ('claimed', 'in_progress');

    INSERT INTO prediction_logs (user_id, issue_id,
                                  predicted_hours, actual_hours, error_margin)
    SELECT
        42,
        1,
        i.estimated_time_hours,
        8.5,
        ABS(i.estimated_time_hours - 8.5)
    FROM issues i
    WHERE i.issue_id = 1;

    INSERT INTO user_activity_logs (user_id, action, entity, entity_id)
    VALUES (42, 'COMPLETE_ISSUE', 'issue', 1);

COMMIT;


SELECT * FROM issues;