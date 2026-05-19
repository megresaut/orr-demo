const express = require('express');
const { requireAuth } = require('../middleware/auth');
const c = require('../controllers/projectController');

const router = express.Router();
router.use(requireAuth);
router.get('/', c.list);
router.post('/', c.create);
router.get('/:id', c.get);
router.patch('/:id', c.update);
router.post('/:id/delete-mark', c.markDeleted);
router.post('/:id/restore', c.restore);
router.delete('/:id', c.remove);
router.put('/:id/rates', c.replaceRates);
router.post('/:id/tasks', c.addTask);
router.post('/:id/rates', c.addRate);
router.delete('/:id/rates/:rateId', c.removeRate);

module.exports = router;
