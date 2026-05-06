const express = require('express');
const { requireAuth } = require('../middleware/auth');
const c = require('../controllers/analyticsController');

const router = express.Router();
router.use(requireAuth);
router.get('/portfolio', c.portfolio);
router.get('/projects/:id', c.projectAnalytics);

module.exports = router;
