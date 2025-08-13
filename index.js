const TelegramBot = require('node-telegram-bot-api');
const brain = require('brain.js');
const md5 = require('md5');
const express = require('express');

// Cấu hình bot với Webhook
const token = process.env.TELEGRAM_TOKEN || '7751217253:AAHYIOAF0HMufS9sm5soBgjOjdIy1XwyILg';
const webhookUrl = process.env.WEBHOOK_URL || 'https://bot-md5-phantich-1.onrender.com';
const bot = new TelegramBot(token, { polling: false });
bot.setWebHook(`${webhookUrl}/bot${token}`);

// Tạo dữ liệu huấn luyện giả lập (1000 mẫu)
function generateTrainingData() {
  const data = [];
  for (let i = 0; i < 1000; i++) {
    const seed = i.toString();
    const md5Hash = md5(seed);
    const hexSum = md5Hash.split('').reduce((sum, c) => sum + parseInt(c, 16), 0);
    const total = (hexSum % 16) + 3;
    const taixiu = total >= 11 ? 1 : 0;
    const vi = [
      Math.floor(total / 3) % 6 + 1,
      Math.floor(total / 3) % 6 + 1,
      (total - 2 * Math.floor(total / 3)) % 6 + 1
    ].map(v => (v === 0 ? 1 : v));
    data.push({ md5: md5Hash, taixiu, vi });
  }
  return data;
}

const trainingData = generateTrainingData();

// Trích xuất đặc trưng từ mã MD5
function extractFeatures(md5) {
  const hexValues = md5.split('').map(c => parseInt(c, 16));
  const segments = [];
  for (let i = 0; i < 32; i += 8) segments.push(md5.slice(i, i + 8));
  return [
    hexValues.reduce((sum, v) => sum + v, 0),
    hexValues.reduce((sum, v) => sum + v, 0) / hexValues.length,
    Math.sqrt(hexValues.reduce((sum, v) => sum + (v - hexValues.reduce((s, v) => s + v, 0) / hexValues.length) ** 2, 0) / hexValues.length),
    md5.split('').filter(c => /[0-9]/.test(c)).length,
    md5.split('').filter(c => /[a-f]/.test(c)).length,
    ...segments.map(seg => seg.split('').reduce((sum, c) => sum + parseInt(c, 16), 0)),
    new Set(md5).size
  ];
}

// Huấn luyện mô hình AI
const net = new brain.NeuralNetwork();
const trainingSet = trainingData.map(({ md5, taixiu }) => ({
  input: extractFeatures(md5).map(v => v / 1000),
  output: [taixiu]
}));
net.train(trainingSet);

// Dự đoán vị (không random)
function predictVi(features) {
  const total = (features.reduce((sum, v) => sum + v, 0) % 16) + 3;
  const vi = [
    Math.floor(total / 3) % 6 + 1,
    Math.floor(total / 3) % 6 + 1,
    (total - 2 * Math.floor(total / 3)) % 6 + 1
  ].map(v => (v === 0 ? 1 : v));
  return vi;
}

// Phân tích cầu
const history = [];
function analyzeBridge() {
  if (history.length < 3) return 'Chưa đủ dữ liệu để phân tích cầu.';
  const last3 = history.slice(-3);
  const last4 = history.slice(-4);
  if (last3.every(x => x === last3[0])) return `Cầu bệt ${last3[0]} (liên tục ${history.length} ván).`;
  if (last4.length >= 4 && last4.join(',') === 'Tài,Xỉu,Tài,Xỉu') return 'Cầu 1-1 (Tài-Xỉu xen kẽ).';
  if (last4.length >= 4 && last4.join(',') === 'Tài,Tài,Xỉu,Xỉu') return 'Cầu 2-2 (Tài-Tài-Xỉu-Xỉu).';
  return 'Cầu không rõ ràng, cần theo dõi thêm.';
}

// Kiểm tra mã MD5 hợp lệ
function isValidMd5(md5) {
  return /^[0-9a-fA-F]{32}$/.test(md5);
}

// Xử lý lệnh /md5
bot.onText(/\/md5 (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const md5 = match[1];

  if (!isValidMd5(md5)) {
    bot.sendMessage(chatId, 'Mã MD5 không hợp lệ! Vui lòng nhập mã MD5 32 ký tự.');
    return;
  }

  const features = extractFeatures(md5);
  const taixiuPred = net.run(features.map(v => v / 1000))[0];
  const taixiu = taixiuPred > 0.5 ? 'Tài' : 'Xỉu';
  const confidence = (taixiuPred > 0.5 ? taixiuPred : 1 - taixiuPred) * 200;
  const vi = predictVi(features);
  const viStr = vi.join('-');

  history.push(taixiu);
  if (history.length > 10) history.shift();
  const bridgeAnalysis = analyzeBridge();

  const response = `
💎 PHÂN TÍCH TÀI XỈU MD5 💎
MD5: ${md5}
DỰ ĐOÁN: ${taixiu}
ĐOÁN VỊ: ${viStr}
TỈ LỆ THẮNG: ${confidence.toFixed(2)}%
KHUYẾN NGHỊ ĐẶT: ${taixiu} hoặc Vị ${viStr}
PHÂN TÍCH CẦU: ${bridgeAnalysis}
  `;
  bot.sendMessage(chatId, response);
});

// Cấu hình server Express cho Webhook
const app = express();
app.use(express.json());

app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.send('Bot is running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
