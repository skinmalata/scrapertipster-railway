const express = require('express');
const router = express.Router();
const chatbot = require('../services/chatbot');

router.post('/chat', async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length < 1) {
    return res.status(400).json({ success: false, error: 'Please provide a message' });
  }

  if (message.length > 500) {
    return res.status(400).json({ success: false, error: 'Message too long (max 500 characters)' });
  }

  try {
    const result = await chatbot.getChatResponse(message.trim());
    res.json({
      success: true,
      response: result.response,
      source: result.source
    });
  } catch (error) {
    console.error('Chat error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Something went wrong. Please try again.'
    });
  }
});

router.get('/chat/info', (req, res) => {
  res.json({
    success: true,
    name: 'WinFulltime Assistant',
    description: 'Ask me anything about WinFulltime\'s football predictions, betting markets, leagues, and more.'
  });
});

module.exports = router;
