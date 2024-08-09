import express from 'express';

const router = express.Router();

router.get('/healthcheck', (req, res) => {
  res.sendStatus(200);
});

export default router;
