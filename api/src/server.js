// Runs the API on your computer: npm run dev (Vercel does not use this file).
const app = require('./app');
const config = require('./config');

app.listen(config.port, () => {
  console.log(`Nurullah POS API is running on http://localhost:${config.port}`);
});
