const { createApp } = require('./app');
const config = require('./config');

createApp().listen(config.port, () => {
  console.log(`Nurullah POS API is running on port ${config.port}`);
});
