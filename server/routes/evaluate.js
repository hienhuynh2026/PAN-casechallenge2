const express = require('express');
const router = express.Router();
const { evaluateResume, deepGrade, agentRecommend } = require('../controllers/evaluateController');

router.post('/', evaluateResume);
router.post('/grade', deepGrade);
router.post('/agent', agentRecommend);

module.exports = router;
