const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const c = require('../controllers/orgController');

const LOGO_DIR = path.join(__dirname, '..', 'uploads', 'logos');
fs.mkdirSync(LOGO_DIR, { recursive: true });

const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp', 'image/gif']);

const storage = multer.diskStorage({
  destination: (req, _file, cb) => cb(null, LOGO_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.png').toLowerCase();
    cb(null, `${req.orgId}${ext}`);
  },
});
const logoUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) cb(null, true);
    else cb(new Error('Logo must be PNG, JPG, SVG, WebP, or GIF'));
  },
});

const router = express.Router();
router.use(requireAuth);
router.get('/me', c.getCurrent);
router.patch('/me', c.update);
router.post('/me/logo', logoUpload.single('logo'), c.uploadLogo);
router.delete('/me/logo', c.removeLogo);

module.exports = router;
