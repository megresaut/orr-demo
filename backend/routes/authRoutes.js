const express = require('express');
const { requireAuth } = require('../middleware/auth');
const c = require('../controllers/authController');

const router = express.Router();
router.post('/signup', c.signup);
router.post('/login', c.login);
router.post('/logout', c.logout);
router.get('/me', requireAuth, c.me);

module.exports = router;
