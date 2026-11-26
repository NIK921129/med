// frontend/components.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export const Card = ({ children }) => <View style={c.card}>{children}</View>;
export const H1 = ({ children }) => <Text style={c.h1}>{children}</Text>;
export const H2 = ({ children }) => <Text style={c.h2}>{children}</Text>;
export const Muted = ({ children }) => <Text style={c.muted}>{children}</Text>;
export const Row = ({ children, style }) => <View style={[c.row, style]}>{children}</View>;

export const Btn = ({ title, onPress, variant = 'primary', small, disabled }) => (
  <TouchableOpacity onPress={onPress} disabled={disabled}
    style={[c.btn, c[variant], small && c.small, disabled && c.disabled]}>
    <Text style={[c.btnText, variant === 'ghost' && c.ghostText, small && c.smallText]}>{title}</Text>
  </TouchableOpacity>
);

const c = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  h1: { fontSize: 22, fontWeight: '700' },
  h2: { fontSize: 17, fontWeight: '600', marginBottom: 4 },
  muted: { fontSize: 14, color: '#6b7280', marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  btn: { backgroundColor: '#0d6efd', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16,
    marginVertical: 6, alignItems: 'center' },
  primary: {},
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#0d6efd' },
  danger: { backgroundColor: '#dc3545' },
  small: { paddingVertical: 8, paddingHorizontal: 12, marginVertical: 2 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  ghostText: { color: '#0d6efd' },
  smallText: { fontSize: 13 },
  disabled: { opacity: 0.5 },
});