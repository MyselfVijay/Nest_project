const mongoose = require('mongoose');
require('dotenv').config();

async function importUsers(dropExisting = false) {
  try {
    // Connect to MongoDB
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hospital-management';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(uri);
    
    const db = mongoose.connection;
    const users = db.collection('users');

    // If dropExisting is true, remove all existing users
    if (dropExisting) {
      console.log('Removing existing users...');
      await users.deleteMany({});
      console.log('Existing users removed.');
    }

    // Read the JSON file containing user data
    const fs = require('fs');
    const path = require('path');
    const dataPath = path.join(__dirname, 'users-data.json');
    
    if (!fs.existsSync(dataPath)) {
      console.error('users-data.json file not found! Please place your exported data in src/scripts/users-data.json');
      return;
    }

    let userData;
    try {
      const fileContent = fs.readFileSync(dataPath, 'utf8');
      // Handle both array and object formats
      userData = JSON.parse(fileContent);
      if (!Array.isArray(userData)) {
        // If it's not an array, check if it has a nested data structure
        if (userData.users) {
          userData = userData.users;
        } else {
          userData = [userData];
        }
      }
    } catch (error) {
      console.error('Error parsing JSON file:', error);
      return;
    }

    console.log(`Found ${userData.length} users to import`);

    // Process each user
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (const user of userData) {
      try {
        // Create a new user object without _id
        const newUser = { ...user };
        delete newUser._id;
        
        // Convert email to lowercase if it exists
        if (newUser.email) {
          newUser.email = newUser.email.toLowerCase();
        }

        // Check if user with same email exists
        const existingUser = newUser.email ? 
          await users.findOne({ email: newUser.email }) : null;
        
        if (existingUser) {
          console.log(`User with email ${newUser.email} already exists, updating...`);
          // Update existing user instead of creating new one
          await users.updateOne(
            { email: newUser.email },
            { $set: newUser }
          );
          results.success++;
          console.log(`Successfully updated user: ${newUser.email}`);
        } else {
          // Insert as new user
          await users.insertOne(newUser);
          results.success++;
          console.log(`Successfully imported user: ${newUser.email || 'unknown email'}`);
        }
      } catch (error) {
        results.failed++;
        const errorMessage = `Error importing user ${user.email || 'unknown'}: ${error.message}`;
        results.errors.push(errorMessage);
        console.error(errorMessage);
        
        // If it's a duplicate key error other than email, try with a new _id
        if (error.code === 11000 && !error.message.includes('email')) {
          try {
            const retryUser = { ...user };
            delete retryUser._id;
            await users.insertOne(retryUser);
            results.failed--;
            results.success++;
            console.log(`Successfully imported user on retry: ${retryUser.email || 'unknown email'}`);
          } catch (retryError) {
            console.error(`Failed retry import for user:`, retryError.message);
          }
        }
      }
    }

    // Print results
    console.log('\nImport Results:');
    console.log(`Successfully imported/updated: ${results.success}`);
    console.log(`Failed to import: ${results.failed}`);
    if (results.errors.length > 0) {
      console.log('\nErrors:');
      results.errors.forEach(error => console.log(`- ${error}`));
    }

  } catch (error) {
    console.error('Import failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDatabase connection closed.');
  }
}

// Start the import process
// Set to true to remove existing users before import
const shouldDropExisting = process.argv.includes('--drop-existing');
console.log(`Running import with ${shouldDropExisting ? 'drop existing users' : 'keep existing users'} option`);
importUsers(shouldDropExisting); 