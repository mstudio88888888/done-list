import React from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useClerk, useUser } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/NotebookUI";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";

export default function AccountTab() {
  const colors = useColors(); const { user } = useUser(); const { signOut } = useClerk(); const client = useQueryClient();
  const leave = () => Alert.alert("Sign out?", "You can sign back in at any time.", [{ text: "Cancel", style: "cancel" }, { text: "Sign out", style: "destructive", onPress: async () => { client.clear(); await signOut(); } }]);
  return <PageShell title="Account" subtitle="Your notebook stays private to this account.">
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.avatar, { backgroundColor: colors.accent }]}><Feather name="user" size={22} color={colors.primary} /></View>
      <View style={{ flex: 1 }}><Text style={[styles.email, { color: colors.foreground }]}>{user?.primaryEmailAddress?.emailAddress ?? "Signed in"}</Text><Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Private notebook account</Text></View>
    </View>
    <View style={[styles.notice, { borderColor: colors.border }]}><Feather name="shield" size={19} color={colors.primary} /><Text style={[styles.noticeText, { color: colors.mutedForeground }]}>Each account has its own lists, diary entries, routines, and goals.</Text></View>
    <Pressable onPress={leave} style={[styles.signOut, { borderColor: colors.destructive }]} testID="sign-out"><Text style={{ color: colors.destructive, fontWeight: "800" }}>Sign out</Text></Pressable>
  </PageShell>;
}
const styles = StyleSheet.create({ card: { borderWidth: 1, borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }, avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }, email: { fontSize: 16, fontWeight: "700" }, notice: { borderWidth: 1, borderStyle: "dashed", borderRadius: 16, padding: 15, gap: 10, flexDirection: "row", alignItems: "flex-start" }, noticeText: { flex: 1, fontSize: 14, lineHeight: 20 }, signOut: { height: 48, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 6 } });