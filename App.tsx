import React from 'react';
import { View, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import { theme } from './src/theme';
import { t, appName } from './src/i18n';
import { ListProvider, useSession } from './src/ListContext';
import WatchlistScreen from './src/screens/WatchlistScreen';
import SearchScreen from './src/screens/SearchScreen';
import ForYouScreen from './src/screens/ForYouScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { SplashLoader } from './src/Loader';

const Tab = createBottomTabNavigator();

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: theme.bg,
    card: theme.surfaceOpaque,
    text: theme.text,
    border: theme.border,
    primary: theme.red,
    notification: theme.red,
  },
};

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Watchlist: 'list',
  Search: 'search',
  ForYou: 'sparkles-outline',
  Settings: 'settings-outline',
};

function HeaderTitle() {
  return (
    <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: 26, letterSpacing: 3, color: theme.text }}>
      {appName}
    </Text>
  );
}

function MainTabs() {
  const insets = useSafeAreaInsets();
  return (
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerStyle: { backgroundColor: theme.surfaceOpaque },
          headerTitleStyle: { color: theme.text, fontFamily: 'BebasNeue_400Regular', fontSize: 26, letterSpacing: 3 },
          headerTitleAlign: 'center',
          headerTintColor: theme.text,
          tabBarStyle: {
            backgroundColor: theme.surfaceOpaque,
            borderTopColor: theme.border,
            height: 64 + insets.bottom,
            paddingTop: 6,
            paddingBottom: insets.bottom + 12,
          },
          tabBarLabelStyle: { fontSize: 12, marginBottom: 4 },
          tabBarActiveTintColor: theme.red,
          tabBarInactiveTintColor: theme.textFaint,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={ICONS[route.name]} size={size} color={color} />
          ),
        })}
      >
        <Tab.Screen name="Watchlist" component={WatchlistScreen} options={{ headerTitle: () => <HeaderTitle />, tabBarLabel: t.tabList }} />
        <Tab.Screen name="Search" component={SearchScreen} options={{ title: t.tabSearch }} />
        <Tab.Screen name="ForYou" component={ForYouScreen} options={{ title: t.tabForYou }} />
        <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: t.tabSettings }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

function Root() {
  const { session, loading } = useSession();
  if (loading) return <SplashLoader />;
  return session ? <MainTabs /> : <OnboardingScreen />;
}

export default function App() {
  const [fontsLoaded] = useFonts({ BebasNeue_400Regular });
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  }
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ListProvider>
          <StatusBar style="light" />
          <Root />
        </ListProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
