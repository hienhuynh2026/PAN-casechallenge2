const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.SKILLBRIDGE_DB_PATH || path.join(__dirname, '../data/skillbridge.db');

let db = null;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db);
  }
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL DEFAULT '',
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      education_level TEXT DEFAULT '',
      target_role TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS work_experience (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      location TEXT DEFAULT '',
      start_date TEXT DEFAULT '',
      end_date TEXT DEFAULT '',
      bullets TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      technologies TEXT NOT NULL DEFAULT '[]',
      date TEXT DEFAULT '',
      bullets TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS certifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS resume_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT DEFAULT '',
      uploaded_at TEXT NOT NULL DEFAULT '',
      raw_text TEXT DEFAULT ''
    );
  `);
}

// ─── Profile ──────────────────────────────────────────────────────────────────

function readProfile() {
  const db = getDb();
  const row = db.prepare('SELECT * FROM profile WHERE id = 1').get();
  if (!row) return null;

  const skills = db.prepare('SELECT name FROM skills ORDER BY id').all().map((r) => r.name);
  const workExperience = db
    .prepare('SELECT * FROM work_experience ORDER BY sort_order, id')
    .all()
    .map((r) => ({ ...r, bullets: JSON.parse(r.bullets) }));
  const projects = db
    .prepare('SELECT * FROM projects ORDER BY sort_order, id')
    .all()
    .map((r) => ({ ...r, bullets: JSON.parse(r.bullets), technologies: JSON.parse(r.technologies) }));
  const certifications = db
    .prepare('SELECT name FROM certifications ORDER BY id')
    .all()
    .map((r) => r.name);
  const upload = db
    .prepare('SELECT filename, uploaded_at FROM resume_uploads ORDER BY id DESC LIMIT 1')
    .get();

  return {
    name: row.name,
    email: row.email,
    phone: row.phone,
    educationLevel: row.education_level,
    targetRole: row.target_role,
    updatedAt: row.updated_at,
    skills,
    workExperience,
    projects,
    certifications,
    resumeMeta: upload || null,
  };
}

function writeProfile(data) {
  const db = getDb();
  const now = new Date().toISOString();

  const upsertProfile = db.prepare(`
    INSERT INTO profile (id, name, email, phone, education_level, target_role, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      email = excluded.email,
      phone = excluded.phone,
      education_level = excluded.education_level,
      target_role = excluded.target_role,
      updated_at = excluded.updated_at
  `);

  upsertProfile.run(
    data.name || '',
    data.email || '',
    data.phone || '',
    data.educationLevel || '',
    data.targetRole || '',
    now
  );

  if (data.skills !== undefined) {
    db.prepare('DELETE FROM skills').run();
    const insertSkill = db.prepare('INSERT OR IGNORE INTO skills (name) VALUES (?)');
    for (const s of data.skills || []) {
      if (s && s.trim()) insertSkill.run(s.trim());
    }
  }

  return now;
}

function writeFullProfile(data) {
  const db = getDb();
  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    // Core profile row
    db.prepare(`
      INSERT INTO profile (id, name, email, phone, education_level, target_role, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        email = excluded.email,
        phone = excluded.phone,
        education_level = excluded.education_level,
        target_role = excluded.target_role,
        updated_at = excluded.updated_at
    `).run(
      data.name || '',
      data.email || '',
      data.phone || '',
      data.educationLevel || '',
      data.targetRole || '',
      now
    );

    // Skills
    db.prepare('DELETE FROM skills').run();
    const insertSkill = db.prepare('INSERT OR IGNORE INTO skills (name) VALUES (?)');
    for (const s of data.skills || []) {
      if (s && s.trim()) insertSkill.run(s.trim());
    }

    // Work experience
    db.prepare('DELETE FROM work_experience').run();
    const insertExp = db.prepare(`
      INSERT INTO work_experience (company, title, location, start_date, end_date, bullets, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (let i = 0; i < (data.workExperience || []).length; i++) {
      const exp = data.workExperience[i];
      insertExp.run(
        exp.company || '',
        exp.title || '',
        exp.location || '',
        exp.startDate || '',
        exp.endDate || '',
        JSON.stringify(exp.bullets || []),
        i
      );
    }

    // Projects
    db.prepare('DELETE FROM projects').run();
    const insertProj = db.prepare(`
      INSERT INTO projects (name, technologies, date, bullets, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (let i = 0; i < (data.projects || []).length; i++) {
      const proj = data.projects[i];
      insertProj.run(
        proj.name || '',
        JSON.stringify(proj.technologies || []),
        proj.date || '',
        JSON.stringify(proj.bullets || []),
        i
      );
    }

    // Certifications
    db.prepare('DELETE FROM certifications').run();
    const insertCert = db.prepare('INSERT INTO certifications (name) VALUES (?)');
    for (const c of data.certifications || []) {
      if (c && c.trim()) insertCert.run(c.trim());
    }
  });

  transaction();
  return now;
}

function saveResumeUpload(filename, rawText) {
  const db = getDb();
  db.prepare('INSERT INTO resume_uploads (filename, uploaded_at, raw_text) VALUES (?, ?, ?)').run(
    filename || '',
    new Date().toISOString(),
    rawText || ''
  );
}

function getLatestRawText() {
  const db = getDb();
  const row = db.prepare('SELECT raw_text, filename FROM resume_uploads ORDER BY id DESC LIMIT 1').get();
  return row || null;
}

// ─── Work experience CRUD ─────────────────────────────────────────────────────

function addWorkExperience(data) {
  const db = getDb();
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM work_experience').get().m ?? -1;
  const result = db.prepare(`
    INSERT INTO work_experience (company, title, location, start_date, end_date, bullets, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.company || '', data.title || '', data.location || '',
    data.startDate || '', data.endDate || '',
    JSON.stringify(data.bullets || []), maxOrder + 1
  );
  return result.lastInsertRowid;
}

function updateWorkExperience(id, data) {
  const db = getDb();
  db.prepare(`
    UPDATE work_experience SET company=?, title=?, location=?, start_date=?, end_date=?, bullets=?
    WHERE id=?
  `).run(
    data.company || '', data.title || '', data.location || '',
    data.startDate || '', data.endDate || '',
    JSON.stringify(data.bullets || []), id
  );
}

function deleteWorkExperience(id) {
  getDb().prepare('DELETE FROM work_experience WHERE id=?').run(id);
}

// ─── Projects CRUD ────────────────────────────────────────────────────────────

function addProject(data) {
  const db = getDb();
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM projects').get().m ?? -1;
  const result = db.prepare(`
    INSERT INTO projects (name, technologies, date, bullets, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    data.name || '',
    JSON.stringify(data.technologies || []),
    data.date || '',
    JSON.stringify(data.bullets || []),
    maxOrder + 1
  );
  return result.lastInsertRowid;
}

function updateProject(id, data) {
  const db = getDb();
  db.prepare(`
    UPDATE projects SET name=?, technologies=?, date=?, bullets=? WHERE id=?
  `).run(
    data.name || '',
    JSON.stringify(data.technologies || []),
    data.date || '',
    JSON.stringify(data.bullets || []),
    id
  );
}

function deleteProject(id) {
  getDb().prepare('DELETE FROM projects WHERE id=?').run(id);
}

module.exports = {
  getDb,
  readProfile,
  writeProfile,
  writeFullProfile,
  saveResumeUpload,
  getLatestRawText,
  addWorkExperience,
  updateWorkExperience,
  deleteWorkExperience,
  addProject,
  updateProject,
  deleteProject,
};
