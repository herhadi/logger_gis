const { createApp } = require('./app');
const config = require('./config');
const app = createApp();

app.listen(config.port, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${config.port}`);
});
