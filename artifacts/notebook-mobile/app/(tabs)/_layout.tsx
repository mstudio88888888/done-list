import React, { useEffect } from "react";
import { Platform, StyleSheet, useColorScheme, View } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";

const screens = [
  ["index", "Done", "check-circle", "checkmark.circle"],
  ["todo", "To-do", "circle", "circle"],
  ["diary", "Diary", "book-open", "book"],
  ["plans", "Plans", "target", "flag"],
  ["account", "Account", "user", "person"],
] as const;

function NativeTabLayout() {
  return <NativeTabs>
    <NativeTabs.Trigger name="index"><Icon sf={{ default: "checkmark.circle", selected: "checkmark.circle.fill" }} /><Label>Done</Label></NativeTabs.Trigger>
    <NativeTabs.Trigger name="todo"><Icon sf={{ default: "circle", selected: "circle.fill" }} /><Label>To-do</Label></NativeTabs.Trigger>
    <NativeTabs.Trigger name="diary"><Icon sf={{ default: "book", selected: "book.fill" }} /><Label>Diary</Label></NativeTabs.Trigger>
    <NativeTabs.Trigger name="plans"><Icon sf={{ default: "flag", selected: "flag.fill" }} /><Label>Plans</Label></NativeTabs.Trigger>
    <NativeTabs.Trigger name="account"><Icon sf={{ default: "person", selected: "person.fill" }} /><Label>Account</Label></NativeTabs.Trigger>
  </NativeTabs>;
}

function ClassicTabLayout() {
  const colors = useColors(); const scheme = useColorScheme(); const isIOS = Platform.OS === "ios"; const isWeb = Platform.OS === "web";
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.mutedForeground, tabBarStyle: { position: "absolute", backgroundColor: isIOS ? "transparent" : colors.background, borderTopWidth: isWeb ? 1 : 0, borderTopColor: colors.border, elevation: 0, ...(isWeb ? { height: 84 } : {}) }, tabBarBackground: () => isIOS ? <BlurView intensity={100} tint={scheme === "dark" ? "dark" : "light"} style={StyleSheet.absoluteFill} /> : isWeb ? <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} /> : null }}>
    {screens.map(([name, title, icon, symbol]) => <Tabs.Screen key={name} name={name} options={{ title, tabBarIcon: ({ color }) => Platform.OS === "ios" ? <SymbolView name={symbol} tintColor={color} size={24} /> : <Feather name={icon} size={21} color={color} /> }} />)}
  </Tabs>;
}

export default function TabLayout() {
  const { isSignedIn, getToken } = useAuth();
  useEffect(() => { getToken(); }, [getToken]);
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  return isLiquidGlassAvailable() ? <NativeTabLayout /> : <ClassicTabLayout />;
}