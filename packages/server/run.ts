import { createServer } from './src';

const port = +(process.env.PORT || 8080);

const startServer = createServer({ storage: 'memory' });
const dbServer = startServer(port);

console.log('running on port', port);
process.on('SIGINT', function () {
  dbServer.close(() => {
    console.log('Shut down server');
    // some cleanup code
    process.exit();
  });
});
