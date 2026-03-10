const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(process.cwd(), 'users.json');
const RESET_TOKENS = {};

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function hashPassword(password) {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString();
}

function registerUser(email, password) {
  const users = loadUsers();
  if (users[email]) {
    throw new Error('Email already registered');
  }
  const activationToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
  users[email] = { 
    email, 
    password: hashPassword(password), 
    createdAt: new Date().toISOString(),
    verified: false,
    activationToken
  };
  saveUsers(users);
  return activationToken;
}

function activateUser(email, token) {
  const users = loadUsers();
  const user = users[email];
  if (!user) throw new Error('Invalid user');
  if (user.activationToken !== token) throw new Error('Invalid token');
  
  user.verified = true;
  delete user.activationToken;
  users[email] = user;
  saveUsers(users);
  return true;
}

function createResetToken(email) {
  const users = loadUsers();
  if (!users[email]) return null;
  
  const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
  RESET_TOKENS[token] = { email, expires: Date.now() + 3600000 };
  return token;
}

function resetPassword(token, newPassword) {
  const resetData = RESET_TOKENS[token];
  if (!resetData) throw new Error('Invalid token');
  if (Date.now() > resetData.expires) {
    delete RESET_TOKENS[token];
    throw new Error('Token expired');
  }
  
  const users = loadUsers();
  if (!users[resetData.email]) throw new Error('User not found');
  
  users[resetData.email].password = hashPassword(newPassword);
  saveUsers(users);
  delete RESET_TOKENS[token];
  return true;
}

function getAllUsers() {
  const users = loadUsers();
  // Return safe view
  return Object.entries(users).map(([email, data]) => ({
    email,
    createdAt: data.createdAt,
    verified: data.verified
  }));
}

function deleteUser(email) {
  const users = loadUsers();
  if (!users[email]) throw new Error('User not found');
  delete users[email];
  saveUsers(users);
}

module.exports = {
  loadUsers,
  hashPassword,
  registerUser,
  activateUser,
  createResetToken,
  resetPassword,
  getAllUsers,
  deleteUser
};
