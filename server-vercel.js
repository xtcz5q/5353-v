const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

let users = {};
let aiPlayers = {};
let messages = [];
let gameRecords = [];
let syncData = {};

const initAIPlayers = () => {
  const defaultAIPlayers = [
    { aiId: 'ai_1', nickname: '新手小白', avatar: '🐣', level: 'easy', stats: { skillPoints: 600, totalGames: 80, wins: 30 } },
    { aiId: 'ai_2', nickname: '初级棋手', avatar: '🐤', level: 'easy', stats: { skillPoints: 650, totalGames: 100, wins: 40 } },
    { aiId: 'ai_3', nickname: '业余爱好者', avatar: '🐔', level: 'medium', stats: { skillPoints: 750, totalGames: 150, wins: 70 } },
    { aiId: 'ai_4', nickname: '业余高手', avatar: '🦃', level: 'medium', stats: { skillPoints: 850, totalGames: 200, wins: 110 } },
    { aiId: 'ai_5', nickname: '地区冠军', avatar: '🦅', level: 'hard', stats: { skillPoints: 950, totalGames: 280, wins: 170 } },
    { aiId: 'ai_6', nickname: '省级选手', avatar: '🦉', level: 'hard', stats: { skillPoints: 1000, totalGames: 320, wins: 200 } },
    { aiId: 'ai_7', nickname: '国家大师', avatar: '🦋', level: 'expert', stats: { skillPoints: 1080, totalGames: 380, wins: 250 } },
    { aiId: 'ai_8', nickname: '世界冠军', avatar: '🐲', level: 'expert', stats: { skillPoints: 1120, totalGames: 420, wins: 280 } },
    { aiId: 'ai_9', nickname: '棋神', avatar: '👑', level: 'master', stats: { skillPoints: 1160, totalGames: 450, wins: 300 } },
    { aiId: 'ai_10', nickname: '棋圣', avatar: '🏆', level: 'master', stats: { skillPoints: 1200, totalGames: 500, wins: 350 } }
  ];
  defaultAIPlayers.forEach(ai => {
    if (!aiPlayers[ai.aiId]) {
      aiPlayers[ai.aiId] = ai;
    }
  });
};

initAIPlayers();

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: '未提供令牌' });
  }
  try {
    const decoded = jwt.verify(token, 'gomoku_secret_key_2024');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: '无效令牌' });
  }
};

app.post('/api/auth/register', async (req, res) => {
  const { phone, password, nickname, avatar } = req.body;
  if (users[phone]) {
    return res.json({ success: false, message: '用户已存在' });
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = {
    userId: 'user_' + Date.now(),
    phone,
    password: hashedPassword,
    nickname: nickname || '玩家' + Math.floor(Math.random() * 1000),
    avatar: avatar || '👤',
    stats: { skillPoints: 800, totalGames: 0, wins: 0, losses: 0 },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  users[phone] = user;
  const token = jwt.sign({ userId: user.userId, phone }, 'gomoku_secret_key_2024', { expiresIn: '7d' });
  res.json({ success: true, data: { user, token } });
});

app.post('/api/auth/login', async (req, res) => {
  const { phone, password } = req.body;
  const user = users[phone];
  if (!user) {
    return res.json({ success: false, message: '用户不存在' });
  }
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.json({ success: false, message: '密码错误' });
  }
  const token = jwt.sign({ userId: user.userId, phone }, 'gomoku_secret_key_2024', { expiresIn: '7d' });
  res.json({ success: true, data: { user, token } });
});

app.get('/api/auth/me', verifyToken, (req, res) => {
  const user = users[req.user.phone];
  if (!user) {
    return res.json({ success: false, message: '用户不存在' });
  }
  res.json({ success: true, data: { user } });
});

app.get('/api/players', (req, res) => {
  const players = Object.values(users).map(u => ({
    id: u.userId,
    phone: u.phone,
    nickname: u.nickname,
    avatar: u.avatar,
    stats: u.stats,
    isGuest: false
  }));
  res.json({ success: true, data: { players } });
});

app.get('/api/ai', (req, res) => {
  res.json({ success: true, data: { aiPlayers: Object.values(aiPlayers) } });
});

app.get('/api/ai/random', (req, res) => {
  const level = req.query.level;
  let filtered = Object.values(aiPlayers);
  if (level) {
    filtered = filtered.filter(ai => ai.level === level);
  }
  const randomAI = filtered[Math.floor(Math.random() * filtered.length)];
  res.json({ success: true, data: { ai: randomAI } });
});

app.post('/api/messages', verifyToken, (req, res) => {
  const message = {
    _id: 'msg_' + Date.now(),
    userId: req.user.userId,
    content: req.body.content,
    type: req.body.type || 'text',
    createdAt: Date.now()
  };
  messages.unshift(message);
  if (messages.length > 100) messages.pop();
  res.json({ success: true, data: { message } });
});

app.get('/api/messages', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json({ success: true, data: { messages: messages.slice(0, limit) } });
});

app.post('/api/games/record', verifyToken, (req, res) => {
  const record = {
    _id: 'game_' + Date.now(),
    userId: req.user.userId,
    ...req.body,
    createdAt: Date.now()
  };
  gameRecords.push(record);
  res.json({ success: true, data: { record } });
});

app.post('/api/sync', verifyToken, (req, res) => {
  syncData[req.user.userId] = {
    ...req.body,
    syncedAt: Date.now()
  };
  res.json({ success: true, message: '数据同步成功' });
});

app.get('/api/sync', verifyToken, (req, res) => {
  const data = syncData[req.user.userId] || {};
  res.json({ success: true, data });
});

app.post('/api/players/points/add', verifyToken, (req, res) => {
  const { searchKey, points } = req.body;
  let player = users[searchKey];
  if (!player) {
    player = Object.values(users).find(u => u.userId === searchKey || u.nickname === searchKey);
  }
  if (!player) {
    return res.json({ success: false, message: '玩家不存在' });
  }
  player.stats.skillPoints = Math.max(0, player.stats.skillPoints + points);
  player.updatedAt = Date.now();
  res.json({ success: true, data: { player } });
});

app.post('/api/players/points/reduce', verifyToken, (req, res) => {
  const { searchKey, points } = req.body;
  let player = users[searchKey];
  if (!player) {
    player = Object.values(users).find(u => u.userId === searchKey || u.nickname === searchKey);
  }
  if (!player) {
    return res.json({ success: false, message: '玩家不存在' });
  }
  player.stats.skillPoints = Math.max(0, player.stats.skillPoints - points);
  player.updatedAt = Date.now();
  res.json({ success: true, data: { player } });
});

app.get('/api/leaderboard', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const allPlayers = [
    ...Object.values(users).map(u => ({
      id: u.userId,
      nickname: u.nickname,
      avatar: u.avatar,
      skillPoints: u.stats.skillPoints,
      totalGames: u.stats.totalGames,
      wins: u.stats.wins,
      type: 'user'
    })),
    ...Object.values(aiPlayers).map(ai => ({
      id: ai.aiId,
      nickname: ai.nickname,
      avatar: ai.avatar,
      skillPoints: ai.stats.skillPoints,
      totalGames: ai.stats.totalGames,
      wins: ai.stats.wins,
      type: 'ai'
    }))
  ];
  allPlayers.sort((a, b) => b.skillPoints - a.skillPoints);
  res.json({ success: true, data: { leaderboard: allPlayers.slice(0, limit) } });
});

app.get('/api', (req, res) => {
  res.json({ success: true, message: '技能五子棋后端 API', version: '1.0.0' });
});

module.exports = (req, res) => {
  app(req, res);
};