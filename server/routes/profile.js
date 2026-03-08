const express = require('express');
const router = express.Router();
const {
  getProfile, saveProfile, patchProfile,
  addWorkExp, updateWorkExp, deleteWorkExp,
  addProject, updateProject, deleteProject,
} = require('../controllers/profileController');

router.get('/', getProfile);
router.post('/', saveProfile);
router.put('/', saveProfile);
router.patch('/', patchProfile);

// Work experience
router.post('/work-experience', addWorkExp);
router.put('/work-experience/:id', updateWorkExp);
router.delete('/work-experience/:id', deleteWorkExp);

// Projects
router.post('/projects', addProject);
router.put('/projects/:id', updateProject);
router.delete('/projects/:id', deleteProject);

module.exports = router;
