// frontend/api.js
import Constants from 'expo-constants';
import { io } from 'socket.io-client';

export const API = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:5000';
const tokenKey = 'md_token';

export const getToken = () => (typeof localStorage !== 'undefined' ? localStorage.getItem(tokenKey) : null);
export const setToken = (t) => typeof localStorage !== 'undefined' && (t ? localStorage.setItem(tokenKey, t) : localStorage.removeItem(tokenKey));

async function request(path, method = 'GET', body, isForm = false) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isForm && body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method, headers, body: isForm ? body : body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed');
  return res.json();
}

export const api = {
  sendOtp: (mobile) => request('/auth/otp', 'POST', { mobile }),
  login: (mobile, otp, role) => request('/auth/login', 'POST', { mobile, otp, role }),
  me: () => request('/users/me'),
  pharmacies: (lat, lng) => request(`/pharmacies?lat=${lat}&lng=${lng}&radius=5`),
  search: (q) => request(`/catalogue/search?q=${encodeURIComponent(q)}`),
  createOrder: (data) => request('/orders', 'POST', data),
  myOrders: () => request('/orders'),
  updateOrder: (id, action, data = {}) => request(`/orders/${id}/${action}`, 'PATCH', data),
  uploadPrescription: (formData) => request('/prescriptions', 'POST', formData, true),
  assignDelivery: (orderId, partnerId) => request('/delivery/assign', 'POST', { orderId, partnerId }),
  updateDelivery: (id, data) => request(`/delivery/${id}`, 'PATCH', data),
  verifyOtp: (orderId, otp) => request(`/orders/${orderId}/verify-otp`, 'POST', { otp }),
  adminPending: () => request('/admin/pharmacies/pending'),
  approvePharmacy: (id) => request(`/admin/pharmacies/${id}/approve`, 'PATCH'),
  audit: () => request('/admin/audit'),
  support: (data) => request('/support', 'POST', data),
};

export const socket = io(API, { transports: ['websocket'] });
export const joinRoom = (room) => socket.emit('join', { room });