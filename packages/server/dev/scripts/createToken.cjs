const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '../../.env'),
});
const jwt = require('jsonwebtoken');

const [id, type = 'test'] = process.argv.slice(2);

if (!id) throw new Error('Id arg required');

const secret = process.env.JWT_SECRET;
const token = jwt.sign(
  {
    'x-triplit-token-type': type,
    'x-triplit-project-id': id,
  },
  secret
);
console.log(token);
