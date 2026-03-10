const express = require('express');
const router = express.Router();
const userService = require('../services/users');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@scrapertipster.com';

router.post('/register', (req, res) => {
  console.log('Register request received:', req.body);
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required' });
  }
  try {
    const activationToken = userService.registerUser(email, password);
    console.log('========================================');
    console.log('ACTIVATION LINK for', email, ':');
    console.log('http://localhost:3000/activate.html?token=' + activationToken + '&email=' + encodeURIComponent(email));
    console.log('========================================');
    res.json({ success: true, message: 'Registration successful. Please check your email to activate your account.' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/activate', (req, res) => {
  const { email, token } = req.body;
  if (!email || !token) {
    return res.status(400).json({ message: 'Email and token required' });
  }
  try {
    userService.activateUser(email, token);
    console.log('User activated:', email);
    res.json({ success: true, message: 'Account activated successfully!' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/login', (req, res) => {
  res.status(403).json({ message: 'Login is currently disabled' });
});

router.get('/check-auth', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.json({ authenticated: false });
  }
  try {
    const user = JSON.parse(authHeader);
    const users = userService.loadUsers();
    if (users[user.email]) {
      return res.json({ authenticated: true, user });
    }
    return res.json({ authenticated: false });
  } catch (e) {
    return res.json({ authenticated: false });
  }
});

router.post('/logout', (req, res) => {
  res.json({ success: true });
});

router.post('/reset-password', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email required' });
  }
  const token = userService.createResetToken(email);
  if (token) {
    console.log('Password reset token for', email, ':', token);
  }
  res.json({ success: true, message: 'Reset link sent (check server console for token)' });
});

router.post('/reset-password/confirm', (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ message: 'Token and new password required' });
  }
  try {
    userService.resetPassword(token, newPassword);
    res.json({ success: true, message: 'Password reset successful' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Admin routes
router.post('/admin/login', (req, res) => {
  res.status(403).json({ message: 'Login is currently disabled' });
});

router.get('/admin/users', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== ADMIN_EMAIL) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const users = userService.getAllUsers().map(u => ({
    ...u,
    role: u.email === ADMIN_EMAIL ? 'admin' : 'user'
  }));
  res.json({ users });
});

router.delete('/admin/users/:email', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== ADMIN_EMAIL) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const { email } = req.params;
  if (email === ADMIN_EMAIL) {
    return res.status(400).json({ message: 'Cannot delete admin' });
  }
  try {
    userService.deleteUser(email);
    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
});

router.post('/auth/google', (req, res) => {
    res.status(403).json({ success: false, message: 'Login is currently disabled' });
});

module.exports = router;
