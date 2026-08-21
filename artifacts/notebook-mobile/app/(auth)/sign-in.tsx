import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Link, router } from "expo-router";
import { useSignIn } from "@clerk/expo";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useColors } from "@/hooks/useColors";

export default function SignInScreen() {
  const colors = useColors(); const { signIn, errors, fetchStatus } = useSignIn();
  const [emailAddress, setEmailAddress] = useState(""); const [password, setPassword] = useState("");
  const [submitError, setSubmitError] = useState("");
  const submit = async () => {
    setSubmitError("");
    const { error } = await signIn.password({ emailAddress, password });
    if (error) {
      setSubmitError(error.message || "We couldn't sign you in. Check your email and password.");
      return;
    }
    if (signIn.status === "complete") await signIn.finalize({ navigate: () => router.replace("/(tabs)") });
  };
  return <KeyboardAwareScrollViewCompat style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.container} bottomOffset={40}>
    <View style={[styles.logo, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground, fontFamily: "Fraunces_700Bold", fontSize: 26 }}>✓</Text></View>
    <Text style={[styles.title, { color: colors.foreground }]}>Welcome back.</Text><Text style={[styles.copy, { color: colors.mutedForeground }]}>Your notebook is waiting.</Text>
    <TextInput value={emailAddress} onChangeText={setEmailAddress} placeholder="Email address" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" keyboardType="email-address" style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} testID="sign-in-email" />
    <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={colors.mutedForeground} secureTextEntry style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} testID="sign-in-password" />
    {errors.fields.identifier?.message ? <Text style={{ color: colors.destructive }}>{errors.fields.identifier.message}</Text> : null}
    {errors.fields.password?.message ? <Text style={{ color: colors.destructive }}>{errors.fields.password.message}</Text> : null}
    {submitError ? <Text style={{ color: colors.destructive }}>{submitError}</Text> : null}
    <Pressable disabled={!emailAddress || !password || fetchStatus === "fetching"} onPress={submit} style={[styles.button, { backgroundColor: colors.primary, opacity: !emailAddress || !password || fetchStatus === "fetching" ? .45 : 1 }]} testID="sign-in-submit"><Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>Sign in</Text></Pressable>
    <Link href="/(auth)/sign-up" asChild><Pressable><Text style={[styles.link, { color: colors.primary }]}>New here? Create an account</Text></Pressable></Link>
  </KeyboardAwareScrollViewCompat>;
}
const styles = StyleSheet.create({ container: { paddingHorizontal: 24, paddingTop: 100, paddingBottom: 40, gap: 14 }, logo: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", marginBottom: 14 }, title: { fontFamily: "Fraunces_700Bold", fontSize: 35 }, copy: { fontSize: 16, marginBottom: 20 }, input: { height: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 }, button: { height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 8 }, link: { textAlign: "center", fontWeight: "700", marginTop: 12 } });