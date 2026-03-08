const express = require('express');
const router = express.Router();
const { getAllJobs, getJobById } = require('../controllers/jobsController');

router.get('/', getAllJobs);
router.get('/:id', getJobById);

module.exports = router;
