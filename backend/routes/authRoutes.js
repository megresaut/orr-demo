const express = require('express');
const { requireAuth } = require('../middleware/auth');
const c = require('../controllers/authController');

const router = express.Router();
router.post('/signup', c.signup);
router.post('/login', c.login);
router.post('/logout', c.logout);
router.get('/me', requireAuth, c.me);
router.patch('/me', requireAuth, c.updateMe);
router.post('/forgot', c.forgot);
router.post('/reset', c.reset);

module.exports = router;
