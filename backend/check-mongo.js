const mongoose = require('mongoose');

(async () => {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nakhsha';
    console.log('Trying to connect to MongoDB URI:', uri);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log('OK: Connected to MongoDB');
    await mongoose.connection.close();
    process.exit(0);
  } catch (e) {
    console.error('Mongo connect error:', e && e.message);
    if (e && e.stack) console.error(e.stack);
    process.exit(1);
  }
})();
