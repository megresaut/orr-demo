const express = require('express');
const { requireAuth } = require('../middleware/auth');
const c = require('../controllers/orgController');

const router = express.Router();
router.use(requireAuth);
router.get('/me', c.getCurrent);
router.patch('/me', c.update);

module.exports = router;
