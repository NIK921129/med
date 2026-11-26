// backend/server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static('uploads'));

// ============ MODELS (inline, SRS §8.1) ============
const User = mongoose.model('User', new mongoose.Schema({
  name: String, mobile: { type: String, unique: true }, role: String,
  status: { type: String, default: 'active' }, createdAt: { type: Date, default: Date.now }
}));
const Pharmacy = mongoose.model('Pharmacy', new mongoose.Schema({
  legalName: String, storeName: String, address: String,
  location: { lat: Number, lng: Number }, hours: String,
  licenceMetadata: Object, approvalStatus: { type: String, default: 'pending' },
  ownerId: String
}));
const CatalogueItem = mongoose.model('CatalogueItem', new mongoose.Schema({
  displayName: String, brand: String, strength: String, form: String,
  activeStatus: { type: Boolean, default: true }, prescriptionRequired: Boolean
}));
const Inventory = mongoose.model('Inventory', new mongoose.Schema({
  pharmacyId: String, catalogueItemId: String,
  availabilityStatus: String, lastConfirmedAt: Date, quotedPrice: Number
}));
const Order = mongoose.model('Order', new mongoose.Schema({
  customerId: String, pharmacyId: String, items: Array,
  quotedTotal: Number, deliveryFee: Number, status: String,
  prescriptionId: String, otp: String, timestamps: Object
}, { timestamps: true }));
const Prescription = mongoose.model('Prescription', new mongoose.Schema({
  orderId: String, secureFileReference: String, reviewStatus: String, accessLog: Array
}));
const DeliveryTask = mongoose.model('DeliveryTask', new mongoose.Schema({
  orderId: String, partnerId: String, pickupStatus: String,
  deliveryStatus: String, proofReference: String
}));
const Payment = mongoose.model('Payment', new mongoose.Schema({
  orderId: String, providerReference: String, amount: Number,
  status: String, refundReference: String
}));
const AuditEvent = mongoose.model('AuditEvent', new mongoose.Schema({
  actorId: String, role: String, action: String, entityId: String,
  metadata: Object, timestamp: { type: Date, default: Date.now }
}));
const SupportTicket = mongoose.model('SupportTicket', new mongoose.Schema({
  orderId: String, raisedBy: String, category: String,
  status: String, resolution: String, createdAt: { type: Date, default: Date.now }
}));

// ============ AUTH (SRS FR-01, §3.1) ============
const otps = new Map(); // In production: use Redis

const auth = (roles = []) => async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    if (roles.length && !roles.includes(decoded.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  } catch { res.status(401).json({ error: 'Unauthorized' }); }
};

const audit = async (actorId, role, action, entityId, metadata = {}) =>
  AuditEvent.create({ actorId, role, action, entityId, metadata });

// Request OTP
app.post('/auth/otp', async (req, res) => {
  const { mobile } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otps.set(mobile, { otp, expires: Date.now() + 5 * 60 * 1000 });
  // TODO: integrate SMS provider (SRS §9)
  console.log(`OTP for ${mobile}: ${otp}`);
  res.json({ message: 'OTP sent' });
});

// Verify OTP → JWT
app.post('/auth/login', async (req, res) => {
  const { mobile, otp, role = 'customer' } = req.body;
  const stored = otps.get(mobile);
  if (!stored || stored.otp !== otp || Date.now() > stored.expires)
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  otps.delete(mobile);
  let user = await User.findOne({ mobile });
  if (!user) user = await User.create({ mobile, role });
  const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user });
});

// ============ USERS & ADDRESSES ============
app.get('/users/me', auth(), async (req, res) => res.json(await User.findById(req.user.userId)));
app.patch('/users/me', auth(), async (req, res) =>
  res.json(await User.findByIdAndUpdate(req.user.userId, req.body, { new: true })));

// ============ PHARMACIES (FR-04, FR-16) ============
app.get('/pharmacies', auth(), async (req, res) => {
  const { lat, lng, radius = 5 } = req.query;
  const query = { approvalStatus: 'approved' };
  if (lat && lng) {
    // Haversine approximation via MongoDB
    query.$expr = {
      $lte: [
        { $sqrt: {
          $add: [
            { $pow: [{ $multiply: [{ $subtract: ['$location.lat', parseFloat(lat)] }, 111] }, 2] },
            { $pow: [{ $multiply: [{ $subtract: ['$location.lng', parseFloat(lng)] }, 111] }, 2] }
          ]
        }}, parseFloat(radius)
      ]
    };
  }
  res.json(await Pharmacy.find(query));
});

app.post('/pharmacies', auth(['pharmacy']), async (req, res) => {
  const p = await Pharmacy.create({ ...req.body, ownerId: req.user.userId });
  await audit(req.user.userId, req.user.role, 'pharmacy_created', p._id);
  res.json(p);
});

app.patch('/pharmacies/:id', auth(['pharmacy', 'admin']), async (req, res) =>
  res.json(await Pharmacy.findByIdAndUpdate(req.params.id, req.body, { new: true })));

// ============ CATALOGUE (FR-05, FR-06) ============
app.get('/catalogue/search', auth(), async (req, res) => {
  const { q, lat, lng } = req.query;
  const items = await CatalogueItem.find({
    activeStatus: true,
    $or: [
      { displayName: new RegExp(q, 'i') },
      { brand: new RegExp(q, 'i') }
    ]
  }).limit(50);
  // Attach pharmacy availability
  const withAvailability = await Promise.all(items.map(async (item) => {
    const inv = await Inventory.find({ catalogueItemId: item._id.toString() })
      .populate('pharmacyId').limit(10);
    return { ...item.toObject(), availability: inv };
  }));
  res.json(withAvailability);
});

app.post('/catalogue', auth(['pharmacy', 'admin']), async (req, res) =>
  res.json(await CatalogueItem.create(req.body)));

app.patch('/catalogue/inventory', auth(['pharmacy']), async (req, res) => {
  const { catalogueItemId, availabilityStatus, quotedPrice } = req.body;
  const inv = await Inventory.findOneAndUpdate(
    { pharmacyId: req.user.userId, catalogueItemId },
    { availabilityStatus, quotedPrice, lastConfirmedAt: new Date() },
    { upsert: true, new: true }
  );
  res.json(inv);
});

// ============ PRESCRIPTIONS (FR-07, §11.3) ============
const upload = multer({ dest: 'uploads/', limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/prescriptions', auth(['customer']), upload.single('file'), async (req, res) => {
  const p = await Prescription.create({
    orderId: req.body.orderId,
    secureFileReference: req.file.path,
    reviewStatus: 'pending'
  });
  res.json({ prescriptionId: p._id });
});

app.get('/prescriptions/:id', auth(['pharmacy', 'admin']), async (req, res) => {
  const p = await Prescription.findById(req.params.id);
  p.accessLog.push({ userId: req.user.userId, at: new Date() });
  await p.save();
  await audit(req.user.userId, req.user.role, 'prescription_accessed', p._id);
  res.json(p);
});

app.patch('/prescriptions/:id', auth(['pharmacy']), async (req, res) =>
  res.json(await Prescription.findByIdAndUpdate(req.params.id,
    { reviewStatus: req.body.reviewStatus }, { new: true })));

// ============ ORDERS (FR-08 → FR-14) ============
app.post('/orders', auth(['customer']), async (req, res) => {
  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  const order = await Order.create({
    ...req.body, customerId: req.user.userId, status: 'placed', otp,
    timestamps: { placed: new Date() }
  });
  io.to(`pharmacy:${order.pharmacyId}`).emit('order:new', order);
  await audit(req.user.userId, 'customer', 'order_placed', order._id);
  res.json(order);
});

app.get('/orders', auth(), async (req, res) => {
  const q = req.user.role === 'customer' ? { customerId: req.user.userId }
    : req.user.role === 'pharmacy' ? { pharmacyId: req.body.pharmacyId }
    : {};
  res.json(await Order.find(q).sort({ createdAt: -1 }));
});

app.patch('/orders/:id/accept', auth(['pharmacy']), async (req, res) => {
  const o = await Order.findByIdAndUpdate(req.params.id,
    { status: 'accepted', 'timestamps.accepted': new Date() }, { new: true });
  io.to(`customer:${o.customerId}`).emit('order:update', o);
  await audit(req.user.userId, 'pharmacy', 'order_accepted', o._id);
  res.json(o);
});

app.patch('/orders/:id/reject', auth(['pharmacy']), async (req, res) => {
  const o = await Order.findByIdAndUpdate(req.params.id,
    { status: 'rejected', rejectionReason: req.body.reason }, { new: true });
  io.to(`customer:${o.customerId}`).emit('order:update', o);
  res.json(o);
});

app.patch('/orders/:id/status', auth(['pharmacy', 'delivery']), async (req, res) => {
  const o = await Order.findByIdAndUpdate(req.params.id,
    { status: req.body.status, [`timestamps.${req.body.status}`]: new Date() }, { new: true });
  io.to(`customer:${o.customerId}`).emit('order:update', o);
  res.json(o);
});

app.post('/orders/:id/verify-otp', auth(['delivery']), async (req, res) => {
  const o = await Order.findById(req.params.id);
  if (o.otp !== req.body.otp) return res.status(400).json({ error: 'Invalid OTP' });
  o.status = 'delivered'; o.timestamps.delivered = new Date();
  await o.save();
  io.to(`customer:${o.customerId}`).emit('order:update', o);
  res.json({ success: true });
});

// ============ DELIVERY (FR-11, FR-17) ============
app.post('/delivery/assign', auth(['admin']), async (req, res) => {
  const { orderId, partnerId } = req.body;
  const task = await DeliveryTask.create({
    orderId, partnerId, pickupStatus: 'assigned', deliveryStatus: 'pending'
  });
  io.to(`partner:${partnerId}`).emit('task:new', task);
  res.json(task);
});

app.patch('/delivery/:id', auth(['delivery']), async (req, res) => {
  const t = await DeliveryTask.findByIdAndUpdate(req.params.id, req.body, { new: true });
  io.to(`customer:${t.orderId}`).emit('delivery:update', t);
  res.json(t);
});

app.post('/delivery/:id/location', auth(['delivery']), async (req, res) => {
  io.to(`order:${req.params.id}`).emit('delivery:location', req.body);
  res.json({ ok: true });
});

// ============ PAYMENTS (FR-15) ============
app.post('/payments/initiate', auth(['customer']), async (req, res) => {
  // TODO: Integrate Razorpay (SRS §9)
  const p = await Payment.create({
    orderId: req.body.orderId, amount: req.body.amount, status: 'pending'
  });
  res.json({ paymentId: p._id, amount: p.amount });
});

app.post('/payments/webhook', async (req, res) => {
  // TODO: Verify Razorpay signature
  const { orderId, providerReference, status } = req.body;
  await Payment.findOneAndUpdate({ orderId },
    { providerReference, status }, { new: true });
  res.json({ received: true });
});

// ============ ADMIN (FR-18) ============
app.get('/admin/pharmacies/pending', auth(['admin']), async (req, res) =>
  res.json(await Pharmacy.find({ approvalStatus: 'pending' })));

app.patch('/admin/pharmacies/:id/approve', auth(['admin']), async (req, res) => {
  const p = await Pharmacy.findByIdAndUpdate(req.params.id,
    { approvalStatus: 'approved' }, { new: true });
  await audit(req.user.userId, 'admin', 'pharmacy_approved', p._id);
  res.json(p);
});

app.get('/admin/audit', auth(['admin']), async (req, res) =>
  res.json(await AuditEvent.find().sort({ timestamp: -1 }).limit(200)));

app.post('/admin/suspend/:userId', auth(['admin']), async (req, res) => {
  await User.findByIdAndUpdate(req.params.userId, { status: 'suspended' });
  await audit(req.user.userId, 'admin', 'user_suspended', req.params.userId);
  res.json({ ok: true });
});

// ============ SUPPORT (FR-20) ============
app.post('/support', auth(), async (req, res) =>
  res.json(await SupportTicket.create({ ...req.body, raisedBy: req.user.userId })));
app.get('/support', auth(['admin']), async (req, res) =>
  res.json(await SupportTicket.find({ status: { $ne: 'resolved' } })));

// ============ SOCKET.IO (FR-12, realtime) ============
io.on('connection', (socket) => {
  socket.on('join', ({ room }) => socket.join(room));
  socket.on('delivery:location', ({ orderId, lat, lng }) =>
    io.to(`order:${orderId}`).emit('delivery:location', { lat, lng }));
});

// ============ HEALTH + START ============
app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => server.listen(process.env.PORT || 5000,
    () => console.log('API running on', process.env.PORT || 5000)));