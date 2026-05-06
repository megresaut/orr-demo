const express = require('express');
const { requireAuth } = require('../middleware/auth');
const c = require('../controllers/projectController');

const router = express.Router();
router.use(requireAuth);
router.get('/', c.list);
router.post('/', c.create);
router.get('/:id', c.get);
router.patch('/:id', c.update);
router.delete('/:id', c.remove);
router.put('/:id/rates', c.replaceRates);

module.exports = router;
