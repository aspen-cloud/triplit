import { createServer } from '@triplit/server';

const port = +(process.env.PORT || 8080);

const startServer = await createServer({
  storage: 'sqlite',
  verboseLogs: !!process.env.VERBOSE_LOGS,
  jwtSecret: process.env.JWT_SECRET,
  projectId: process.env.PROJECT_ID,
  externalJwtSecret: process.env.EXTERNAL_JWT_SECRET,
});

const dbServer = startServer(port);

console.log('running on port', port);
process.on('SIGINT', function () {
  dbServer.close(() => {
    console.log('Shutting down server... ');
    process.exit();
  });
});
