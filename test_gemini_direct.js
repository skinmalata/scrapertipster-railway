require('dotenv').config();

async function testGeminiAPI() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log('API Key present:', !!apiKey);
  console.log('API Key prefix:', apiKey ? apiKey.substring(0, 10) + '...' : 'N/A');
  
  const prompt = 'Analyze this football match: Liverpool vs Manchester City';
  
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    console.log('\nRequest URL:', url);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500
        }
      })
    });
    
    console.log('\nResponse status:', response.status);
    const data = await response.json();
    console.log('\nFull response:');
    console.log(JSON.stringify(data, null, 2));
    
    if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
      console.log('\n=== SUCCESS ===');
      console.log('Summary:', data.candidates[0].content.parts[0].text);
    } else {
      console.log('\n=== FAILED ===');
      if (data.error) {
        console.log('Error:', data.error);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testGeminiAPI();
