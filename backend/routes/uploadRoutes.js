const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const c = require('../controllers/uploadController');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

const router = express.Router();
router.use(requireAuth);
router.post('/onboarding', upload.single('file'), c.onboarding);
router.post('/tasks/:projectId', upload.single('file'), c.tasks);
router.post('/rates/:projectId', upload.single('file'), c.rates);
router.post('/timesheet/:projectId', upload.single('file'), c.timesheet);
router.post('/timesheet/:projectId/manual', c.timesheetManual);

module.exports = router;
