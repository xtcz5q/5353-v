/**
 * Vercel Serverless 版本 - 移除 WebSocket 依赖
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// 内存存储
let users = {};
let aiPlayers = {};
let messages = [];
let gameRecords = [];
let syncData = {};

// 初始化AI玩家
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

// 创建应用
const app = express();

// 中间件
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: '*', credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use(express.static('public', {
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
  }
}));

// 速率限制
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: '请求过于频繁' }
});
app.use('/api/', limiter);

// JWT验证中间件
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: '未授权' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = decoded;
    next();
  } catch (e) {
    res.status(401).json({ success: false, message: '无效token' });
  }
};

// 生成JWT
const generateToken = (userId, phone) => {
  return jwt.sign({ userId, phone }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
};

// === 认证路由 ===
app.post('/api/auth/register', async (req, res) => {
  const { phone, password, nickname, avatar } = req.body;
  if (!phone || !password) {
    return res.json({ success: false, message: '缺少参数' });
  }
  
  if (users['user_' + phone]) {
    return res.json({ success: false, message: '用户已存在' });
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = {
    id: 'user_' + phone,
    phone,
    password: hashedPassword,
    nickname: nickname || '玩家' + Math.random().toString(36).substr(2, 4),
    avatar: avatar || ['🐱', '🐶', '🐭', '🐹', '🐰'][Math.floor(Math.random() * 5)],
    points: 0,
    stats: { total: 0, wins: 0, losses: 0 },
    createdAt: Date.now()
  };
  users[user.id] = user;
  
  const token = generateToken(user.id, phone);
  res.json({ success: true, data: { user, token } });
});

app.post('/api/auth/login', async (req, res) => {
  const { phone, password } = req.body;
  const user = users['user_' + phone];
  
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.json({ success: false, message: '账号或密码错误' });
  }
  
  const token = generateToken(user.id, phone);
  res.json({ success: true, data: { user, token } });
});

app.post('/api/auth/guest', (req, res) => {
  const guestId = 'guest_' + Date.now();
  const user = {
    id: guestId,
    phone: guestId,
    nickname: '游客' + Math.random().toString(36).substr(2, 4),
    avatar: '👤',
    points: 0,
    stats: { total: 0, wins: 0, losses: 0 },
    isGuest: true,
    createdAt: Date.now()
  };
  users[guestId] = user;
  
  const token = generateToken(user.id, user.phone);
  res.json({ success: true, data: { user, token } });
});

app.get('/api/auth/me', verifyToken, (req, res) => {
  const user = users[req.user.userId];
  if (!user) {
    return res.json({ success: false, message: '用户不存在' });
  }
  res.json({ success: true, data: { user } });
});

app.put('/api/auth/me', verifyToken, (req, res) => {
  const user = users[req.user.userId];
  if (!user) {
    return res.json({ success: false, message: '用户不存在' });
  }
  
  if (req.body.nickname) user.nickname = req.body.nickname;
  if (req.body.avatar) user.avatar = req.body.avatar;
  
  res.json({ success: true, data: { user } });
});

// === 玩家路由 ===
app.get('/api/players/leaderboard', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const allPlayers = [
    ...Object.values(users).filter(u => !u.isGuest),
    ...Object.values(aiPlayers).map(ai => ({ ...ai, id: ai.aiId }))
  ];
  
  allPlayers.sort((a, b) => (b.points || b.stats?.skillPoints || 0) - (a.points || a.stats?.skillPoints || 0));
  
  const leaderboard = allPlayers.slice(0, limit).map((p, index) => ({
    rank: index + 1,
    id: p.id,
    nickname: p.nickname,
    avatar: p.avatar,
    points: p.points || p.stats?.skillPoints || 0,
    wins: p.stats?.wins || 0,
    totalGames: p.stats?.totalGames || p.stats?.total || 0
  }));
  
  res.json({ success: true, data: { leaderboard } });
});

app.post('/api/players/points/add', verifyToken, (req, res) => {
  const { phone, amount } = req.body;
  const targetId = phone.startsWith('user_') ? phone : 'user_' + phone;
  const user = users[targetId];
  
  if (!user) {
    return res.json({ success: false, message: '用户不存在' });
  }
  
  user.points = (user.points || 0) + amount;
  res.json({ success: true, data: { user } });
});

app.post('/api/players/points/reduce', verifyToken, (req, res) => {
  const { phone, amount } = req.body;
  const targetId = phone.startsWith('user_') ? phone : 'user_' + phone;
  const user = users[targetId];
  
  if (!user) {
    return res.json({ success: false, message: '用户不存在' });
  }
  
  if ((user.points || 0) < amount) {
    return res.json({ success: false, message: '积分不足' });
  }
  
  user.points = (user.points || 0) - amount;
  res.json({ success: true, data: { user } });
});

app.get('/api/players/all', verifyToken, (req, res) => {
  const includeAI = req.query.includeAI !== 'false';
  let players = Object.values(users).filter(u => !u.isGuest);
  if (includeAI) {
    players = [...players, ...Object.values(aiPlayers).map(ai => ({ ...ai, id: ai.aiId }))];
  }
  res.json({ success: true, data: { players } });
});

// === AI路由 ===
app.get('/api/ai', (req, res) => {
  res.json({ success: true, data: { aiPlayers: Object.values(aiPlayers) } });
});

app.get('/api/ai/random', (req, res) => {
  const level = req.query.level;
  let candidates = Object.values(aiPlayers);
  if (level) {
    candidates = candidates.filter(ai => ai.level === level);
  }
  const ai = candidates[Math.floor(Math.random() * candidates.length)];
  res.json({ success: true, data: { ai } });
});

// === 同步路由 ===
app.post('/api/sync', verifyToken, (req, res) => {
  const userId = req.user.userId;
  syncData[userId] = { ...req.body, userId, version: (syncData[userId]?.version || 0) + 1, updatedAt: Date.now() };
  res.json({ success: true, data: { version: syncData[userId].version } });
});

app.get('/api/sync', verifyToken, (req, res) => {
  const userId = req.user.userId;
  const data = syncData[userId] || { userId, version: 0 };
  res.json({ success: true, data });
});

// === 消息路由 ===
app.get('/api/messages', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const start = (page - 1) * limit;
  const end = start + limit;
  res.json({ success: true, data: { messages: messages.slice(start, end), count: messages.length } });
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
  if (messages.length > 1000) messages.pop();
  res.json({ success: true, data: { message } });
});

// === 游戏路由 ===
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

// === 健康检查 ===
app.get('/health', (req, res) => {
  res.json({ success: true, message: '服务运行正常', timestamp: new Date() });
});

app.get('/api', (req, res) => {
  res.json({ success: true, message: '技能五子棋后端 API', version: '1.0.0' });
});

// 默认路由 - 返回前端页面
app.get('*', (req, res) => {
  res.sendFile('index.html', { root: './public' });
});

// Vercel Serverless 导出
module.exports = app;
