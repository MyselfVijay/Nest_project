const mongoose = require('mongoose');
require('dotenv').config();

async function verifyDatabase() {
  try {
    // Connect to MongoDB
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hospital-management';
    console.log('Attempting to connect to MongoDB at:', uri);
    
    await mongoose.connect(uri);
    console.log('Successfully connected to MongoDB');

    // Get all collections
    const collections = await mongoose.connection.db.collections();
    console.log('\nAvailable collections:');
    for (let collection of collections) {
      const count = await collection.countDocuments();
      console.log(`${collection.collectionName}: ${count} documents`);
    }

    // Check users collection specifically
    const users = mongoose.connection.collection('users');
    const userCount = await users.countDocuments();
    console.log('\nUser collection details:');
    console.log(`Total users: ${userCount}`);

    if (userCount > 0) {
      console.log('\nSample user document:');
      const sampleUser = await users.findOne({}, { projection: { password: 0 } });
      console.log(JSON.stringify(sampleUser, null, 2));
    }

  } catch (error) {
    console.error('Database verification failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

verifyDatabase(); 