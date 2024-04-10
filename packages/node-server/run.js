import { createServer } from '@triplit/server';

const port = +(process.env.PORT || 8080);

const startServer = createServer({ storage: 'sqlite' });
const dbServer = startServer(port);

console.log('running on port', port);
process.on('SIGINT', function () {
  dbServer.close(() => {
    console.log('Shut down server');
    // some cleanup code
    process.exit();
  });
});
