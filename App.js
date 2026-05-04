import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useFonts, SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import * as SplashScreen from 'expo-splash-screen';

import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import StoricoScreen from './src/screens/StoricoScreen';
import CostoMaterialeScreen from './src/screens/CostoMaterialeScreen';
import NotaSpeseScreen from './src/screens/NotaSpeseScreen';
import RapportinoScreen from './src/screens/RapportinoScreen';


const Stack = createNativeStackNavigator();

// Mantiene lo splash screen visibile finché i font non sono caricati
SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    'SpaceMono-Regular': SpaceMono_400Regular,
    'SpaceMono-Bold': SpaceMono_700Bold,
  });

  React.useEffect(() => {
    async function prepare() {
      if (fontsLoaded || fontError) {
        await SplashScreen.hideAsync();
      }
    }
    prepare();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Storico" component={StoricoScreen} />
        <Stack.Screen name="CostoMateriale" component={CostoMaterialeScreen} />
        <Stack.Screen name="NotaSpese" component={NotaSpeseScreen} />
        <Stack.Screen name="Rapportino" component={RapportinoScreen} />

      </Stack.Navigator>
    </NavigationContainer>
  );
}
