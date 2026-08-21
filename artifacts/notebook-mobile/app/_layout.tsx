import React, { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkLoaded, ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import { Fraunces_700Bold } from "@expo-google-fonts/fraunces";
import { useFonts } from "expo-font";

SplashScreen.preventAutoHideAsync();
const domain = process.env.EXPO_PUBLIC_DOMAIN;
if (domain) setBaseUrl(`https://${domain}`);
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const proxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;
const queryClient = new QueryClient();

function AccountBoundary() {
  const { getToken, userId } = useAuth();
  const client = useQueryClient();
  const prior = useRef<string | null | undefined>(undefined);
  useEffect(() => { setAuthTokenGetter(() => getToken()); }, [getToken]);
  useEffect(() => {
    if (prior.current !== undefined && prior.current !== userId) client.clear();
    prior.current = userId;
  }, [client, userId]);
  return null;
}

function RootLayoutNav() {
  return <Stack screenOptions={{ headerShown: false }}>
    <Stack.Screen name="(tabs)" />
    <Stack.Screen name="(auth)" options={{ presentation: "modal" }} />
  </Stack>;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold, Fraunces_700Bold });
  useEffect(() => { if (fontsLoaded || fontError) SplashScreen.hideAsync(); }, [fontsLoaded, fontError]);
  if (!fontsLoaded && !fontError) return null;
  if (!publishableKey) throw new Error("Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY");
  return <SafeAreaProvider><ErrorBoundary><ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache} proxyUrl={proxyUrl}><ClerkLoaded><QueryClientProvider client={queryClient}><GestureHandlerRootView style={{ flex: 1 }}><KeyboardProvider><AccountBoundary /><RootLayoutNav /></KeyboardProvider></GestureHandlerRootView></QueryClientProvider></ClerkLoaded></ClerkProvider></ErrorBoundary></SafeAreaProvider>;
}