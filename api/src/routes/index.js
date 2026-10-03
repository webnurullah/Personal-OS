const { Router } = require('express');
const { requireUser } = require('../middleware/auth');

const router = Router();

// Everything below needs a signed-in user.
router.use(requireUser);

router.use('/profile', require('./profile'));
router.use('/categories', require('./categories'));
router.use('/dashboard', require('./dashboard'));
router.use('/tasks', require('./tasks'));
router.use('/events', require('./events'));
router.use('/goals', require('./goals').goals);
router.use('/milestones', require('./goals').milestones);
router.use('/habits', require('./habits').router);
router.use('/learning', require('./learning'));
router.use('/courses', require('./courses').courses);
router.use('/units', require('./courses').units);
router.use('/topics', require('./courses').topics);
router.use('/finance', require('./finance'));
router.use('/health', require('./health'));
router.use('/notes', require('./notes').notes);
router.use('/reminders', require('./notes').reminders);
router.use('/search', require('./search'));
router.use('/notifications', require('./notifications'));
router.use('/data', require('./data'));

module.exports = router;
