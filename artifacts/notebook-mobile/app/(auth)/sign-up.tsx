import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Link, router } from "expo-router";
import { useSignUp } from "@clerk/expo";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useColors } from "@/hooks/useColors";

export default function SignUpScreen() {
  const colors = useColors();
  const { signUp, errors, fetchStatus } = useSignUp();
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [submitError, setSubmitError] = useState("");
  const passwordInvalidLength = password.length > 0 && password.length !== 8;
  const passwordsDoNotMatch = confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit = Boolean(emailAddress && password.length === 8 && password === confirmPassword);

  const submit = async () => {
    setSubmitError("");
    if (password.length !== 8) {
      setSubmitError("Your password must be exactly 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError("Passwords do not match.");
      return;
    }
    const { error } = await signUp.password({ emailAddress, password });
    if (error) {
      setSubmitError("We couldn't create your account. Check your details and try again.");
      return;
    }
    await signUp.verifications.sendEmailCode();
  };

  const verify = async () => {
    setSubmitError("");
    const { error } = await signUp.verifications.verifyEmailCode({ code });
    if (error) {
      setSubmitError(error.message || "That code was not accepted. Please try again.");
      return;
    }
    if (signUp.status === "complete") {
      await signUp.finalize({ navigate: () => router.replace("/(tabs)") });
    }
  };

  const verifying =
    signUp.status === "missing_requirements" &&
    signUp.unverifiedFields.includes("email_address") &&
    signUp.missingFields.length === 0;

  return (
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      bottomOffset={40}
    >
      <View style={[styles.logo, { backgroundColor: colors.primary }]}>
        <Text style={{ color: colors.primaryForeground, fontFamily: "Fraunces_700Bold", fontSize: 26 }}>✓</Text>
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>
        {verifying ? "Check your email." : "Make it yours."}
      </Text>
      <Text style={[styles.copy, { color: colors.mutedForeground }]}>
        {verifying
          ? "Enter the code we sent to finish setting up your private notebook."
          : "A quiet place for your lists, notes, and goals."}
      </Text>

      {verifying ? (
        <>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="Verification code"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
            style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
            testID="verification-code"
          />
          {errors.fields.code?.message ? <Text style={{ color: colors.destructive }}>{errors.fields.code.message}</Text> : null}
          {submitError ? <Text style={{ color: colors.destructive }}>{submitError}</Text> : null}
          <Pressable onPress={verify} style={[styles.button, { backgroundColor: colors.primary }]}>
            <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>Verify account</Text>
          </Pressable>
          <Pressable onPress={() => signUp.verifications.sendEmailCode()}>
            <Text style={[styles.link, { color: colors.primary }]}>Send a new code</Text>
          </Pressable>
        </>
      ) : (
        <>
          <TextInput
            value={emailAddress}
            onChangeText={setEmailAddress}
            placeholder="Email address"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            keyboardType="email-address"
            style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
            testID="sign-up-email"
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password (8 characters)"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            maxLength={8}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
            testID="sign-up-password"
          />
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm password"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            maxLength={8}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
            testID="sign-up-confirm-password"
          />
          {passwordInvalidLength ? <Text style={{ color: colors.destructive }}>Password must be exactly 8 characters.</Text> : null}
          {passwordsDoNotMatch ? <Text style={{ color: colors.destructive }}>Passwords do not match.</Text> : null}
          {errors.fields.emailAddress?.message ? <Text style={{ color: colors.destructive }}>{errors.fields.emailAddress.message}</Text> : null}
          {submitError ? <Text style={{ color: colors.destructive }}>{submitError}</Text> : null}
          <Pressable
            disabled={!canSubmit || fetchStatus === "fetching"}
            onPress={submit}
            style={[styles.button, { backgroundColor: colors.primary, opacity: !canSubmit || fetchStatus === "fetching" ? 0.45 : 1 }]}
            testID="sign-up-submit"
          >
            <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>Create account</Text>
          </Pressable>
          <Link href="/(auth)/sign-in" asChild>
            <Pressable>
              <Text style={[styles.link, { color: colors.primary }]}>Already have an account? Sign in</Text>
            </Pressable>
          </Link>
          <View nativeID="clerk-captcha" />
        </>
      )}
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, paddingTop: 100, paddingBottom: 40, gap: 14 },
  logo: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  title: { fontFamily: "Fraunces_700Bold", fontSize: 35 },
  copy: { fontSize: 16, marginBottom: 20, lineHeight: 23 },
  input: { height: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  button: { height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 8 },
  link: { textAlign: "center", fontWeight: "700", marginTop: 12 },
});