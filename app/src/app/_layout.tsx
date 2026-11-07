import "../../global.css";
import { Stack } from "expo-router";
import { Uniwind } from "uniwind";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { WorkspaceProvider } from "../state/WorkspaceProvider";
Uniwind.setTheme("light");
export default function Layout() {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  if (!loaded && !error) return null;
  return (
    <WorkspaceProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </WorkspaceProvider>
  );
}
