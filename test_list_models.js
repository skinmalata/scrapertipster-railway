require('dotenv').config();

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    
    console.log('Available models:');
    if (data.models) {
      data.models.forEach(model => {
        if (model.name && model.name.includes('gemini')) {
          console.log(' -', model.name);
        }
      });
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

listModels();
