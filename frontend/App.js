// frontend/App.js
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getToken, api } from './api';
import * as Screens from './screens';

const Stack = createNativeStackNavigator();

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (getToken()) api.me().then(setUser).catch(() => {}).finally(() => setLoading(false));
    else setLoading(false);
  }, []);

  if (loading) return <Screens.Loading />;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Auth" component={Screens.AuthScreen} />
        ) : user.role === 'customer' ? (
          <>
            <Stack.Screen name="Home" component={Screens.CustomerHome} />
            <Stack.Screen name="Search" component={Screens.SearchScreen} />
            <Stack.Screen name="Checkout" component={Screens.CheckoutScreen} />
            <Stack.Screen name="Orders" component={Screens.OrdersScreen} />
            <Stack.Screen name="Track" component={Screens.TrackScreen} />
          </>
        ) : user.role === 'pharmacy' ? (
          <Stack.Screen name="Pharmacy" component={Screens.PharmacyScreen} />
        ) : user.role === 'delivery' ? (
          <Stack.Screen name="Delivery" component={Screens.DeliveryScreen} />
        ) : (
          <Stack.Screen name="Admin" component={Screens.AdminScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}