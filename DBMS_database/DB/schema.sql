-- ────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- fuzzy ILIKE / similarity() on titles

-- ═══════════════════════════════════════════════════════════
-- LAYER 1: USER LAYER
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
    user_id       SERIAL       PRIMARY KEY,
    username      VARCHAR(50)  UNIQUE NOT NULL,
    email         VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMP    DEFAULT NOW(),
    is_active     BOOLEAN      DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS user_profiles (
    profile_id        SERIAL       PRIMARY KEY,
    user_id           INT          UNIQUE NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    full_name         VARCHAR(100),
    github_username   VARCHAR(50),
    experience_level  VARCHAR(20)  CHECK (experience_level IN ('beginner','intermediate','advanced','expert')),
    available_hours   NUMERIC(4,1),
    bio               TEXT,
    avatar_path       VARCHAR(255),
    updated_at        TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skills (
    skill_id  SERIAL       PRIMARY KEY,
    name      VARCHAR(100) UNIQUE NOT NULL,
    category  VARCHAR(50),
    parent_id INT          REFERENCES skills(skill_id)   -- self-referential hierarchy
);

CREATE TABLE IF NOT EXISTS user_skills (
    user_skill_id SERIAL   PRIMARY KEY,
    user_id       INT      NOT NULL REFERENCES users(user_id)   ON DELETE CASCADE,
    skill_id      INT      NOT NULL REFERENCES skills(skill_id),
    proficiency   SMALLINT CHECK (proficiency BETWEEN 1 AND 5),
    UNIQUE(user_id, skill_id)
);

CREATE TABLE IF NOT EXISTS user_availability (
    availability_id SERIAL      PRIMARY KEY,
    user_id         INT         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    day_of_week     VARCHAR(10),
    hours_available NUMERIC(3,1)
);

-- Per-visit rows: when the user opens the webapp (entered_webapp_at) and when they leave (left_webapp_at, nullable until logged).
CREATE TABLE IF NOT EXISTS user_activity (
    activity_id        SERIAL    PRIMARY KEY,
    user_id            INT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    entered_webapp_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    left_webapp_at     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_entered ON user_activity(user_id, entered_webapp_at DESC);

CREATE TABLE IF NOT EXISTS deleted_accounts (
    deleted_account_id SERIAL       PRIMARY KEY,
    original_user_id   INT,
    username           VARCHAR(50)  NOT NULL,
    email              VARCHAR(100) NOT NULL,
    deleted_at         TIMESTAMP    NOT NULL DEFAULT NOW(),
    reason             VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_deleted_accounts_deleted_at ON deleted_accounts(deleted_at DESC);

CREATE TABLE IF NOT EXISTS weekly_goals (
    weekly_goal_id       SERIAL       PRIMARY KEY,
    user_id              INT          NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    week_start_date      DATE         NOT NULL,
    goal                 VARCHAR(255) NOT NULL,
    current_week_minutes NUMERIC(8,2) NOT NULL DEFAULT 0,
    updated_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_weekly_goals_user_week ON weekly_goals(user_id, week_start_date);

-- ═══════════════════════════════════════════════════════════
-- LAYER 2: REPOSITORY LAYER
-- ═══════════════════════════════════════════════════════════

DROP TABLE IF EXISTS repositories CASCADE;

CREATE TABLE IF NOT EXISTS repositories (
    repo_id     SERIAL       PRIMARY KEY,
    github_id   BIGINT       UNIQUE NOT NULL,       -- GitHub API field: id
    owner       VARCHAR(100) NOT NULL,               -- GitHub API field: owner.login
    name        VARCHAR(100) NOT NULL,               -- GitHub API field: name
    full_name   VARCHAR(200) UNIQUE NOT NULL,        -- GitHub API field: full_name (owner/repo)
    description TEXT,
    stars       INT          DEFAULT 0,
    forks       INT          DEFAULT 0,
    language    VARCHAR(50),
    html_url    VARCHAR(300),                        -- GitHub API field: html_url
    image_path  VARCHAR(255),
    created_at  TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS repo_topics (
    topic_id SERIAL       PRIMARY KEY,
    name     VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS repository_topics (
    repo_id  INT NOT NULL REFERENCES repositories(repo_id) ON DELETE CASCADE,
    topic_id INT NOT NULL REFERENCES repo_topics(topic_id),
    PRIMARY KEY (repo_id, topic_id)
);

-- ═══════════════════════════════════════════════════════════
-- LAYER 3: ISSUE LAYER
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS issues (
    issue_id             SERIAL       PRIMARY KEY,
    github_issue_id      BIGINT       UNIQUE NOT NULL,   -- GitHub API: issues[].id
    repo_id              INT          NOT NULL REFERENCES repositories(repo_id),
    title                VARCHAR(500) NOT NULL,
    body                 TEXT,
    state                VARCHAR(20)  DEFAULT 'open',
    complexity_score     NUMERIC(3,1) CHECK (complexity_score BETWEEN 1 AND 10),
    estimated_time_hours NUMERIC(5,1),
    github_url           VARCHAR(300),                   -- GitHub API: html_url
    screenshot_path      VARCHAR(255),
    created_at           TIMESTAMP    DEFAULT NOW(),
    updated_at           TIMESTAMP    DEFAULT NOW()
);

-- FIX: Added UNIQUE(issue_id, name) so ON CONFLICT DO NOTHING works correctly
--      in insert_issues(). Without this, the ON CONFLICT clause has no target.
CREATE TABLE IF NOT EXISTS issue_labels (
    label_id SERIAL       PRIMARY KEY,
    issue_id INT          NOT NULL REFERENCES issues(issue_id) ON DELETE CASCADE,
    name     VARCHAR(100) NOT NULL,
    color    VARCHAR(10),
    UNIQUE(issue_id, name)              -- <-- REQUIRED for upsert in ingest.py
);

CREATE TABLE IF NOT EXISTS bounty_skills (
    bounty_skill_id SERIAL   PRIMARY KEY,
    issue_id        INT      NOT NULL REFERENCES issues(issue_id) ON DELETE CASCADE,
    skill_id        INT      NOT NULL REFERENCES skills(skill_id),
    required_level  SMALLINT CHECK (required_level BETWEEN 1 AND 5),
    UNIQUE(issue_id, skill_id)          -- prevent duplicate skill tags per issue
);

-- ═══════════════════════════════════════════════════════════
-- LAYER 4: INTERACTION LAYER
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS assignments (
    assignment_id SERIAL      PRIMARY KEY,
    user_id       INT         NOT NULL REFERENCES users(user_id),
    issue_id      INT         NOT NULL REFERENCES issues(issue_id),
    status        VARCHAR(20) DEFAULT 'claimed'
                              CHECK (status IN ('claimed','in_progress','completed','abandoned')),
    claimed_at    TIMESTAMP   DEFAULT NOW(),
    started_at    TIMESTAMP,
    completed_at  TIMESTAMP,
    actual_hours  NUMERIC(5,1),
    UNIQUE(user_id, issue_id)
);

CREATE TABLE IF NOT EXISTS saved_repositories (
    user_id  INT       NOT NULL REFERENCES users(user_id),
    repo_id  INT       NOT NULL REFERENCES repositories(repo_id),
    saved_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, repo_id)
);

CREATE TABLE IF NOT EXISTS user_activity_logs (
    log_id    SERIAL       PRIMARY KEY,
    user_id   INT          NOT NULL REFERENCES users(user_id),
    action    VARCHAR(100) NOT NULL,
    entity    VARCHAR(50),
    entity_id INT,
    logged_at TIMESTAMP    DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- LAYER 5: INTELLIGENCE LAYER
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS recommendations (
    rec_id       SERIAL      PRIMARY KEY,
    user_id      INT         NOT NULL REFERENCES users(user_id),
    issue_id     INT         NOT NULL REFERENCES issues(issue_id),
    score        NUMERIC(5,2),
    reason       TEXT,
    generated_at TIMESTAMP   DEFAULT NOW(),
    UNIQUE(user_id, issue_id)
);

CREATE TABLE IF NOT EXISTS prediction_logs (
    pred_id         SERIAL      PRIMARY KEY,
    user_id         INT         REFERENCES users(user_id),
    issue_id        INT         REFERENCES issues(issue_id),
    predicted_hours NUMERIC(5,1),
    actual_hours    NUMERIC(5,1),
    error_margin    NUMERIC(5,2),
    logged_at       TIMESTAMP   DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- LAYER 6: ARCHIVAL LAYER
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS archive_issues (
    archive_id  SERIAL    PRIMARY KEY,
    original_id INT,
    data        JSONB,
    archived_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS archive_assignments (
    archive_id  SERIAL    PRIMARY KEY,
    original_id INT,
    data        JSONB,
    archived_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- repositories
CREATE INDEX IF NOT EXISTS idx_repos_full_name
    ON repositories(full_name);
    -- Used by: ON CONFLICT(full_name) upsert, Kaggle<->GitHub linking JOIN

CREATE INDEX IF NOT EXISTS idx_repos_name
    ON repositories(name);
    -- Used by: LOWER(name)=LOWER(kaggle_repo_name) matching query

CREATE INDEX IF NOT EXISTS idx_repos_language
    ON repositories(language) WHERE language IS NOT NULL;
    -- Used by: WHERE language='Python'; partial index skips NULL rows entirely

CREATE INDEX IF NOT EXISTS idx_repos_stars
    ON repositories(stars DESC);
    -- Used by: ORDER BY stars DESC trending query — avoids runtime sort

-- issues
CREATE INDEX IF NOT EXISTS idx_issues_repo_id  ON issues(repo_id);
CREATE INDEX IF NOT EXISTS idx_issues_state    ON issues(state);
CREATE INDEX IF NOT EXISTS idx_issues_title_trgm ON issues USING GIN (title gin_trgm_ops);

-- user / skill lookups
CREATE INDEX IF NOT EXISTS idx_user_skills_user     ON user_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_skill    ON user_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_bounty_skills_issue  ON bounty_skills(issue_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user     ON assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_user ON recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_user        ON user_activity_logs(user_id);

-- ============================================================
-- VIEWS
-- ============================================================

CREATE OR REPLACE VIEW v_user_skill_details AS
    SELECT u.username, s.name AS skill, s.category,
           p.name AS parent_skill, us.proficiency
    FROM user_skills us
    JOIN users  u ON u.user_id  = us.user_id
    JOIN skills s ON s.skill_id = us.skill_id
    LEFT JOIN skills p ON p.skill_id = s.parent_id;

CREATE OR REPLACE VIEW v_open_issues_full AS
    SELECT i.issue_id, i.title, i.complexity_score, i.estimated_time_hours,
           r.full_name AS repo, r.language,
           STRING_AGG(s.name, ', ') AS required_skills
    FROM issues i
    JOIN repositories r ON r.repo_id = i.repo_id
    LEFT JOIN bounty_skills bs ON bs.issue_id = i.issue_id
    LEFT JOIN skills s         ON s.skill_id  = bs.skill_id
    WHERE i.state = 'open'
    GROUP BY i.issue_id, r.full_name, r.language;

CREATE OR REPLACE VIEW v_top_recommendations AS
    SELECT u.username, i.title, rec.score, rec.generated_at
    FROM recommendations rec
    JOIN users  u ON u.user_id  = rec.user_id
    JOIN issues i ON i.issue_id = rec.issue_id
    ORDER BY rec.score DESC;

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION trg_update_issue_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_issue_updated ON issues;
CREATE TRIGGER if not exists trg_issue_updated
    BEFORE UPDATE ON issues
    FOR EACH ROW EXECUTE FUNCTION trg_update_issue_timestamp();

-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_log_assignment_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status <> OLD.status THEN
        INSERT INTO user_activity_logs(user_id, action, entity, entity_id)
        VALUES (NEW.user_id, 'STATUS_CHANGE_' || NEW.status, 'assignment', NEW.assignment_id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignment_status_log ON assignments;
CREATE TRIGGER if not exists trg_assignment_status_log
    AFTER UPDATE ON assignments
    FOR EACH ROW EXECUTE FUNCTION trg_log_assignment_change();

-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_set_started_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'in_progress' AND OLD.status = 'claimed' THEN
        NEW.started_at := NOW();
    END IF;
    IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
        NEW.completed_at := NOW();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignment_timestamps ON assignments;
CREATE TRIGGER uf not exists trg_assignment_timestamps
    BEFORE UPDATE ON assignments
    FOR EACH ROW EXECUTE FUNCTION trg_set_started_at();

-- ============================================================
-- FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_match_score(p_user_id INT, p_issue_id INT)
RETURNS NUMERIC LANGUAGE plpgsql AS $$
DECLARE
    v_score    NUMERIC := 0;
    v_count    INT     := 0;
    v_prof     INT;
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
            v_score := v_score + LEAST((v_prof::NUMERIC / v_required) * 20, 20);
        END IF;
        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN RETURN 0; END IF;
    RETURN ROUND(v_score / v_count, 2);
END;
$$;

CREATE OR REPLACE FUNCTION user_has_time(p_user_id INT, p_issue_id INT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE
    v_available NUMERIC;
    v_required  NUMERIC;
BEGIN
    SELECT available_hours      INTO v_available FROM user_profiles WHERE user_id  = p_user_id;
    SELECT estimated_time_hours INTO v_required  FROM issues         WHERE issue_id = p_issue_id;
    RETURN COALESCE(v_available, 0) >= COALESCE(v_required, 0);
END;
$$;

-- ============================================================
-- STORED PROCEDURES
-- ============================================================

CREATE OR REPLACE PROCEDURE claim_issue(p_user_id INT, p_issue_id INT)
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM assignments
        WHERE user_id = p_user_id AND issue_id = p_issue_id
    ) THEN
        RAISE EXCEPTION 'Issue % already claimed by user %', p_issue_id, p_user_id;
    END IF;

    INSERT INTO assignments(user_id, issue_id, status, claimed_at)
    VALUES (p_user_id, p_issue_id, 'claimed', NOW());

    INSERT INTO user_activity_logs(user_id, action, entity, entity_id)
    VALUES (p_user_id, 'CLAIM_ISSUE', 'issue', p_issue_id);

    COMMIT;
END;
$$;

CREATE OR REPLACE PROCEDURE archive_completed_assignment(p_assignment_id INT)
LANGUAGE plpgsql AS $$
DECLARE
    v_data JSONB;
BEGIN
    SELECT row_to_json(a)::JSONB INTO v_data
    FROM assignments a WHERE assignment_id = p_assignment_id;

    IF v_data IS NULL THEN
        RAISE EXCEPTION 'Assignment % not found', p_assignment_id;
    END IF;

    INSERT INTO archive_assignments(original_id, data) VALUES (p_assignment_id, v_data);
    DELETE FROM assignments WHERE assignment_id = p_assignment_id;
    COMMIT;
END;
$$;

CREATE OR REPLACE PROCEDURE generate_all_recommendations()
LANGUAGE plpgsql AS $$
DECLARE
    cur_users  CURSOR FOR SELECT user_id FROM users WHERE is_active = TRUE;
    v_user_id  INT;
    v_issue_id INT;
    v_score    NUMERIC;
BEGIN
    OPEN cur_users;
    LOOP
        FETCH cur_users INTO v_user_id;
        EXIT WHEN NOT FOUND;

        FOR v_issue_id IN SELECT issue_id FROM issues WHERE state = 'open' LOOP
            v_score := calculate_match_score(v_user_id, v_issue_id);
            IF v_score > 10 THEN
                INSERT INTO recommendations(user_id, issue_id, score, generated_at)
                VALUES (v_user_id, v_issue_id, v_score, NOW())
                ON CONFLICT (user_id, issue_id)
                DO UPDATE SET score = EXCLUDED.score, generated_at = NOW();
            END IF;
        END LOOP;
    END LOOP;
    CLOSE cur_users;
    COMMIT;
END;
$$;

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO skills (name, category) VALUES
    ('Python',     'language'),
    ('JavaScript', 'language'),
    ('TypeScript', 'language'),
    ('Go',         'language'),
    ('Rust',       'language'),
    ('React',      'framework'),
    ('Django',     'framework'),
    ('Docker',     'tool'),
    ('PostgreSQL', 'tool'),
    ('Git',        'tool')
ON CONFLICT (name) DO NOTHING;
