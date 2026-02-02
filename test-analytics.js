// Quick test script to check analytics endpoint
const fetch = require('node-fetch');

async function testAnalytics() {
  try {
    // You'll need to replace these with actual values:
    const campId = 'YOUR_CAMP_ID'; // Get from database
    const token = 'YOUR_JWT_TOKEN'; // Get from login

    const response = await fetch(`http://localhost:3000/api/camp-head/${campId}/analytics`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    console.log('Analytics Response:');
    console.log(JSON.stringify(data, null, 2));
    console.log('\nFollow-up Distribution:');
    console.log(data.analytics?.followUpDistribution);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testAnalytics();
