const express = require('express');
const { requireAuth } = require('../middleware/auth');
const c = require('../controllers/settingsController');

const router = express.Router();
router.use(requireAuth);
router.get('/connectors', c.getConnectors);
router.patch('/connectors', c.updateConnectors);

module.exports = router;
