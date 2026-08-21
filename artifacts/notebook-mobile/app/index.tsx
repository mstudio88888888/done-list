import { useAuth } from "@clerk/expo";
import { Redirect } from "expo-router";

export default function IndexRoute() {
  const { isSignedIn } = useAuth();
  return <Redirect href={isSignedIn ? "/(tabs)" : "/(auth)/sign-in"} />;
}