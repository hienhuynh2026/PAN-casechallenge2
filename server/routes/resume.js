const express = require('express');
const multer = require('multer');
const router = express.Router();
const { parseResumeUpload, reparseResume } = require('../controllers/resumeController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

router.post('/parse', upload.single('resume'), parseResumeUpload);
router.post('/reparse', reparseResume);

module.exports = router;
