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

DROP TRIGGER IF EXISTS trg_issue_updated ON issues;
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

DROP TRIGGER IF EXISTS trg_profile_updated ON user_profiles;
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
-- PROCEDURES
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE PROCEDURE claim_issue(p_user_id INT, p_issue_id INT)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO assignments(user_id, issue_id, status, claimed_at)
    VALUES (p_user_id, p_issue_id, 'claimed', NOW());
END;
$$;

CREATE OR REPLACE PROCEDURE claim_issue_demo(p_user_id INT, p_issue_id INT)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO assignments(user_id, issue_id, status, claimed_at)
    VALUES (p_user_id, p_issue_id, 'claimed', NOW());
    COMMIT;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- INDEXES (DEDUPED)
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_repos_full_name ON repositories(full_name);
CREATE INDEX IF NOT EXISTS idx_repos_name ON repositories(name);
CREATE INDEX IF NOT EXISTS idx_repos_language ON repositories(language);
CREATE INDEX IF NOT EXISTS idx_repos_stars ON repositories(stars DESC);

CREATE INDEX IF NOT EXISTS idx_issues_repo_id ON issues(repo_id);
CREATE INDEX IF NOT EXISTS idx_issues_state ON issues(state);
CREATE INDEX IF NOT EXISTS idx_issues_title_trgm ON issues USING GIN (title gin_trgm_ops);

-- ═══════════════════════════════════════════════════════════
-- SEED DATA (CLEANED)
-- ═══════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- DEMO DATA (FOR VIVA / FLASK TESTING ONLY)
-- ═══════════════════════════════════════════════════════════

-- create sample user
INSERT INTO users (username, email, password_hash)
VALUES ('test_user', 'test@giki.edu.pk', 'hash123')
ON CONFLICT DO NOTHING;


-- simulate saved repo
INSERT INTO saved_repositories (user_id, repo_id)
VALUES (1, 1)
ON CONFLICT DO NOTHING;