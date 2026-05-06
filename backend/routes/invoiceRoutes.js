const express = require('express');
const { requireAuth } = require('../middleware/auth');
const c = require('../controllers/invoiceController');

const router = express.Router();
router.use(requireAuth);
router.post('/preview', c.preview);
router.post('/preview-pdf', c.previewPdf);
router.post('/generate', c.generate);
router.get('/', c.list);
router.get('/dunning', c.dunningCheck);
router.get('/:id', c.get);
router.post('/:id/mark-paid', c.markPaid);
router.delete('/:id', c.remove);

module.exports = router;
