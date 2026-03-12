const axios = require('axios');

async function testAnalysis() {
  console.log('=== Testing /api/analysis endpoint ===\n');
  
  try {
    const response = await axios.get('http://localhost:3002/api/analysis', {
      params: {
        homeTeam: 'Liverpool',
        awayTeam: 'Manchester City'
      },
      timeout: 120000
    });
    
    console.log('Response received:');
    console.log('homeTeam:', response.data.homeTeam);
    console.log('awayTeam:', response.data.awayTeam);
    console.log('homeForm:', response.data.homeForm);
    console.log('awayForm:', response.data.awayForm);
    console.log('homeLast10:', JSON.stringify(response.data.homeLast10, null, 2));
    console.log('awayLast10:', JSON.stringify(response.data.awayLast10, null, 2));
    console.log('h2h count:', response.data.h2h?.length || 0);
    if (response.data.h2h && response.data.h2h.length > 0) {
      console.log('First H2H:', JSON.stringify(response.data.h2h[0], null, 2));
    }
    
    // Check if data is valid
    const hasData = response.data.homeForm || response.data.awayForm || 
                   (response.data.homeLast10?.wins > 0) || 
                   (response.data.awayLast10?.wins > 0) ||
                   (response.data.h2h?.length > 0);
    
    console.log('\n=== Validation ===');
    console.log('Has any data:', hasData ? 'YES' : 'NO (empty data from scraper)');
    
    return response.data;
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    return null;
  }
}

async function testAISummary(analysisData) {
  console.log('\n=== Testing /api/ai-summary endpoint ===\n');
  
  if (!analysisData) {
    console.log('Skipping AI summary test - no analysis data');
    return;
  }
  
  try {
    const response = await axios.post('http://localhost:3002/api/ai-summary', {
      homeTeam: analysisData.homeTeam,
      awayTeam: analysisData.awayTeam,
      homeForm: analysisData.homeForm,
      awayForm: analysisData.awayForm,
      homeLast10: analysisData.homeLast10,
      awayLast10: analysisData.awayLast10,
      h2h: analysisData.h2h
    }, {
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log('Response received:');
    console.log('success:', response.data.success);
    if (response.data.summary) {
      console.log('\nAI Summary:');
      console.log('---');
      console.log(response.data.summary);
      console.log('---');
    } else {
      console.log('message:', response.data.message);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

async function main() {
  const analysisData = await testAnalysis();
  await testAISummary(analysisData);
  process.exit(0);
}

main();
