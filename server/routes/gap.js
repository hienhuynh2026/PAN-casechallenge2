const express = require('express');
const router = express.Router();
const { analyzeGap } = require('../controllers/gapController');

router.post('/', analyzeGap);

module.exports = router;
