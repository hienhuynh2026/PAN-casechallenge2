const db = require('../db/database');

function getProfile(req, res) {
  try {
    const profile = db.readProfile();
    res.json(profile);
  } catch (err) {
    console.error('getProfile error:', err);
    res.json(null);
  }
}

function saveProfile(req, res) {
  const { name, skills, educationLevel, targetRole, email, phone,
          workExperience, projects, certifications } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  if (!skills || !Array.isArray(skills) || skills.length === 0) {
    return res.status(400).json({ error: 'At least one skill is required.' });
  }
  if (!targetRole || !targetRole.trim()) {
    return res.status(400).json({ error: 'Target role is required.' });
  }

  try {
    // If structured arrays are provided (full profile save), write everything.
    // Otherwise update only the core profile fields + skills.
    if (workExperience !== undefined || projects !== undefined || certifications !== undefined) {
      db.writeFullProfile({
        name: name.trim(),
        email: email || '',
        phone: phone || '',
        educationLevel: educationLevel || '',
        targetRole: targetRole.trim(),
        skills: (skills || []).map((s) => s.trim()).filter(Boolean),
        workExperience: workExperience || [],
        projects: projects || [],
        certifications: certifications || [],
      });
    } else {
      db.writeProfile({
        name: name.trim(),
        email: email || '',
        phone: phone || '',
        educationLevel: educationLevel || '',
        targetRole: targetRole.trim(),
        skills: (skills || []).map((s) => s.trim()).filter(Boolean),
      });
    }

    const saved = db.readProfile();
    res.json(saved);
  } catch (err) {
    console.error('saveProfile error:', err);
    res.status(500).json({ error: 'Failed to save profile.' });
  }
}

// PATCH individual sections without full overwrite
function patchProfile(req, res) {
  const allowed = ['name', 'email', 'phone', 'educationLevel', 'targetRole', 'skills'];
  const patch = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  }

  try {
    const current = db.readProfile();
    if (!current) return res.status(404).json({ error: 'No profile found.' });

    db.writeProfile({ ...current, ...patch });
    res.json(db.readProfile());
  } catch (err) {
    console.error('patchProfile error:', err);
    res.status(500).json({ error: 'Failed to patch profile.' });
  }
}

// ─── Work experience CRUD ─────────────────────────────────────────────────────

function addWorkExp(req, res) {
  try {
    const id = db.addWorkExperience(req.body);
    res.json({ id, ...req.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function updateWorkExp(req, res) {
  try {
    db.updateWorkExperience(Number(req.params.id), req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function deleteWorkExp(req, res) {
  try {
    db.deleteWorkExperience(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Projects CRUD ────────────────────────────────────────────────────────────

function addProject(req, res) {
  try {
    const id = db.addProject(req.body);
    res.json({ id, ...req.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function updateProject(req, res) {
  try {
    db.updateProject(Number(req.params.id), req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function deleteProject(req, res) {
  try {
    db.deleteProject(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getProfile, saveProfile, patchProfile,
  addWorkExp, updateWorkExp, deleteWorkExp,
  addProject, updateProject, deleteProject,
};
