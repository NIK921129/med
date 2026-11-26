// frontend/screens.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Platform
} from 'react-native';
import { api, setToken, joinRoom, socket } from './api';
import { Card, Btn, H1, H2, Muted, Row } from './components';

const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f7fa', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  input: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginVertical: 6, fontSize: 16, borderWidth: 1, borderColor: '#dde3ea' },
  big: { fontSize: 26, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});

export const Loading = () => (
  <View style={S.center}><ActivityIndicator size="large" color="#0d6efd" /></View>
);

// ---------- AUTH ----------
export function AuthScreen({ navigation }) {
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState(1);
  const [role, setRole] = useState('customer');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try { await api.sendOtp(mobile); setStep(2); Alert.alert('OTP sent (check console in dev)'); }
    catch (e) { Alert.alert(e.message); } finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true);
    try {
      const { token, user } = await api.login(mobile, otp, role);
      setToken(token);
      window?.location?.reload?.();
    } catch (e) { Alert.alert(e.message); } finally { setBusy(false); }
  };

  return (
    <View style={[S.screen, S.center]}>
      <View style={{ width: '100%', maxWidth: 400 }}>
        <Text style={S.big}>💊 Medicine Delivery</Text>
        <Muted>Find medicines from nearby pharmacies</Muted>
        {step === 1 ? (
          <>
            <TextInput style={S.input} placeholder="Mobile number" value={mobile}
              onChangeText={setMobile} keyboardType="phone-pad" />
            <Row>
              {['customer', 'pharmacy', 'delivery', 'admin'].map(r => (
                <Btn key={r} title={r} small variant={role === r ? 'primary' : 'ghost'}
                  onPress={() => setRole(r)} />
              ))}
            </Row>
            <Btn title={busy ? 'Sending...' : 'Send OTP'} onPress={send} disabled={busy || mobile.length < 10} />
          </>
        ) : (
          <>
            <TextInput style={S.input} placeholder="6-digit OTP" value={otp}
              onChangeText={setOtp} keyboardType="number-pad" maxLength={6} />
            <Btn title={busy ? 'Verifying...' : 'Verify & Login'} onPress={verify} disabled={otp.length !== 6} />
          </>
        )}
      </View>
    </View>
  );
}

// ---------- CUSTOMER ----------
export function CustomerHome({ navigation }) {
  return (
    <ScrollView style={S.screen}>
      <Text style={S.big}>Hello 👋</Text>
      <Muted>What do you need today?</Muted>
      <Card>
        <H2>🔍 Search Medicines</H2>
        <Muted>Search by name or brand</Muted>
        <Btn title="Search" onPress={() => navigation.navigate('Search')} />
      </Card>
      <Card>
        <H2>📦 My Orders</H2>
        <Btn title="View Orders" variant="ghost" onPress={() => navigation.navigate('Orders')} />
      </Card>
    </ScrollView>
  );
}

export function SearchScreen({ navigation }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const search = async () => {
    setLoading(true);
    try { setResults(await api.search(q)); } catch (e) { Alert.alert(e.message); }
    finally { setLoading(false); }
  };
  return (
    <View style={S.screen}>
      <Text style={S.big}>Search</Text>
      <Row>
        <TextInput style={[S.input, { flex: 1 }]} placeholder="e.g. Paracetamol" value={q} onChangeText={setQ} />
        <Btn title="Go" onPress={search} disabled={!q || loading} />
      </Row>
      {loading && <ActivityIndicator style={{ marginTop: 20 }} />}
      <FlatList data={results} keyExtractor={i => i._id}
        renderItem={({ item }) => (
          <Card>
            <H2>{item.displayName} {item.strength}</H2>
            <Muted>{item.brand} · {item.form}</Muted>
            {item.availability?.length ? (
              item.availability.slice(0, 2).map(a => (
                <Row key={a._id}>
                  <Muted>Pharmacy: ₹{a.quotedPrice}</Muted>
                  <Btn small title="Order" onPress={() => navigation.navigate('Checkout', {
                    item, pharmacyId: a.pharmacyId, price: a.quotedPrice
                  })} />
                </Row>
              ))
            ) : <Muted>No pharmacy confirmed availability</Muted>}
          </Card>
        )} />
    </View>
  );
}

export function CheckoutScreen({ route, navigation }) {
  const { item, pharmacyId, price } = route.params;
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const place = async () => {
    setBusy(true);
    try {
      const order = await api.createOrder({
        pharmacyId, items: [{ catalogueItemId: item._id, name: item.displayName, qty: 1, price }],
        quotedTotal: price, deliveryFee: 30, address
      });
      Alert.alert('Order placed', `Order #${order._id.slice(-6)} — waiting for pharmacy`);
      navigation.navigate('Track', { orderId: order._id });
    } catch (e) { Alert.alert(e.message); } finally { setBusy(false); }
  };
  return (
    <ScrollView style={S.screen}>
      <Text style={S.big}>Checkout</Text>
      <Card>
        <H2>{item.displayName}</H2>
        <Muted>{item.brand} · ₹{price}</Muted>
        <Muted>Delivery fee: ₹30</Muted>
        <H2>Total: ₹{price + 30}</H2>
      </Card>
      <TextInput style={S.input} placeholder="Delivery address" value={address} onChangeText={setAddress} />
      <Btn title={busy ? 'Placing...' : 'Place Order'} onPress={place} disabled={!address || busy} />
    </ScrollView>
  );
}

export function OrdersScreen({ navigation }) {
  const [orders, setOrders] = useState([]);
  useEffect(() => { api.myOrders().then(setOrders).catch(() => {}); }, []);
  return (
    <ScrollView style={S.screen}>
      <Text style={S.big}>My Orders</Text>
      {orders.map(o => (
        <Card key={o._id}>
          <Row><H2>#{o._id.slice(-6)}</H2><Muted>{o.status}</Muted></Row>
          <Muted>₹{o.quotedTotal + (o.deliveryFee || 0)}</Muted>
          <Btn small title="Track" variant="ghost" onPress={() => navigation.navigate('Track', { orderId: o._id })} />
        </Card>
      ))}
    </ScrollView>
  );
}

export function TrackScreen({ route }) {
  const { orderId } = route.params;
  const [order, setOrder] = useState(null);
  useEffect(() => {
    joinRoom(`customer:${orderId}`);
    const h = (o) => setOrder(o);
    socket.on('order:update', h);
    api.myOrders().then(list => setOrder(list.find(o => o._id === orderId)));
    return () => socket.off('order:update', h);
  }, [orderId]);
  return (
    <View style={S.screen}>
      <Text style={S.big}>Track Order</Text>
      {order ? (
        <Card>
          <H2>Status: {order.status}</H2>
          <Muted>Total: ₹{order.quotedTotal + (order.deliveryFee || 0)}</Muted>
          {order.status === 'delivered' && <H2>✅ Delivered</H2>}
          {['placed', 'accepted', 'preparing', 'picked_up', 'delivered'].map(s => (
            <Muted key={s}>{order.status === s ? '●' : '○'} {s}</Muted>
          ))}
        </Card>
      ) : <ActivityIndicator />}
    </View>
  );
}

// ---------- PHARMACY ----------
export function PharmacyScreen() {
  const [orders, setOrders] = useState([]);
  const refresh = () => api.myOrders().then(setOrders).catch(() => {});
  useEffect(() => { refresh(); joinRoom('pharmacy:default'); }, []);
  const act = async (id, action) => { try { await api.updateOrder(id, action); refresh(); } catch (e) { Alert.alert(e.message); } };
  return (
    <ScrollView style={S.screen}>
      <Text style={S.big}>Pharmacy Orders</Text>
      {orders.map(o => (
        <Card key={o._id}>
          <Row><H2>#{o._id.slice(-6)}</H2><Muted>{o.status}</Muted></Row>
          <Muted>{o.items?.map(i => i.name).join(', ')}</Muted>
          <Muted>₹{o.quotedTotal}</Muted>
          {o.status === 'placed' && (
            <Row>
              <Btn small title="Accept" onPress={() => act(o._id, 'accept')} />
              <Btn small title="Reject" variant="danger" onPress={() => act(o._id, 'reject')} />
            </Row>
          )}
          {o.status === 'accepted' && <Btn small title="Mark Preparing" onPress={() => api.updateOrder(o._id, 'status', { status: 'preparing' }).then(refresh)} />}
          {o.status === 'preparing' && <Btn small title="Ready for Pickup" onPress={() => api.updateOrder(o._id, 'status', { status: 'pickup_ready' }).then(refresh)} />}
        </Card>
      ))}
    </ScrollView>
  );
}

// ---------- DELIVERY ----------
export function DeliveryScreen() {
  const [tasks, setTasks] = useState([]);
  const [otpInputs, setOtpInputs] = useState({});
  useEffect(() => { joinRoom('partner:default'); }, []);
  const verify = async (orderId) => {
    try { await api.verifyOtp(orderId, otpInputs[orderId]); Alert.alert('Delivered ✅'); }
    catch (e) { Alert.alert(e.message); }
  };
  return (
    <ScrollView style={S.screen}>
      <Text style={S.big}>Delivery Tasks</Text>
      {tasks.length === 0 && <Muted>No active tasks. Admin assigns orders.</Muted>}
      {tasks.map(t => (
        <Card key={t._id}>
          <H2>Order #{t.orderId.slice(-6)}</H2>
          <Muted>Pickup: {t.pickupStatus} · Delivery: {t.deliveryStatus}</Muted>
          <TextInput style={S.input} placeholder="Enter customer OTP"
            value={otpInputs[t.orderId] || ''}
            onChangeText={(v) => setOtpInputs({ ...otpInputs, [t.orderId]: v })} keyboardType="number-pad" maxLength={4} />
          <Btn small title="Verify & Complete" onPress={() => verify(t.orderId)} />
        </Card>
      ))}
    </ScrollView>
  );
}

// ---------- ADMIN ----------
export function AdminScreen() {
  const [pending, setPending] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const refresh = () => {
    api.adminPending().then(setPending).catch(() => {});
    api.audit().then(setAuditLog).catch(() => {});
  };
  useEffect(refresh, []);
  return (
    <ScrollView style={S.screen}>
      <Text style={S.big}>Admin Dashboard</Text>
      <H2>Pending Pharmacies ({pending.length})</H2>
      {pending.map(p => (
        <Card key={p._id}>
          <H2>{p.storeName}</H2>
          <Muted>{p.legalName} · {p.address}</Muted>
          <Btn small title="Approve" onPress={() => api.approvePharmacy(p._id).then(refresh)} />
        </Card>
      ))}
      <H2>Recent Audit Events</H2>
      {auditLog.slice(0, 20).map(e => (
        <Card key={e._id}>
          <Muted>{new Date(e.timestamp).toLocaleString()}</Muted>
          <Text>{e.role} · {e.action}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}