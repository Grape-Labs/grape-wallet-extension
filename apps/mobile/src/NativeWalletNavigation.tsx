import { WALLET_STACK_ROUTES, WALLET_TAB_ROUTES } from './walletNavigationPolicy';
export { isWalletTab } from './walletNavigationPolicy';
import { createContext, useContext, type ReactNode } from 'react';
import { DarkTheme, NavigationContainer, usePreventRemove, type NavigationContainerRefWithCurrent, type NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { createBottomTabNavigator, type BottomTabScreenProps } from '@react-navigation/bottom-tabs';

export type WalletTabs = { home: undefined; activity: undefined; discover: undefined; settings: undefined };
export type WalletStack = {
  tabs: NavigatorScreenParams<WalletTabs> | undefined;
  asset: { selectionId: number }; assetActivity: { selectionId: number }; send: undefined; swap: undefined;
  bridge: undefined; rebalance: undefined; receive: undefined; governance: undefined;
};
export type WalletRoute = keyof WalletTabs | Exclude<keyof WalletStack, 'tabs'>;
const Stack = createNativeStackNavigator<WalletStack>();
const Tabs = createBottomTabNavigator<WalletTabs>();
type Content = { render: (name: WalletRoute) => ReactNode; footer: () => ReactNode; blocked: boolean };
const ContentContext = createContext<Content | null>(null);
function useContent() {
  const content = useContext(ContentContext);
  if (!content) throw new Error('Wallet navigation content is unavailable.');
  return content;
}
// Stable component identities keep browser and scroll views alive across renders.
function TabScreen({ route }: BottomTabScreenProps<WalletTabs>) { return useContent().render(route.name); }
function TabBar() { return useContent().footer(); }
function TabScreens() {
  return <Tabs.Navigator initialRouteName="home" backBehavior="initialRoute" detachInactiveScreens={false} tabBar={() => <TabBar />} screenOptions={{ headerShown: false, lazy: false, freezeOnBlur: false, animation: 'none' }}>
    {WALLET_TAB_ROUTES.map((name) => <Tabs.Screen key={name} name={name} component={TabScreen} />)}
  </Tabs.Navigator>;
}
function StackScreen({ route }: NativeStackScreenProps<WalletStack>) {
  const content = useContent();
  usePreventRemove(content.blocked, () => { /* Signing/review must finish or be explicitly dismissed. */ });
  return route.name === 'tabs' ? <TabScreens /> : content.render(route.name as WalletRoute);
}
export function NativeWalletNavigation(props: Content & {
  navigationRef: NavigationContainerRefWithCurrent<WalletStack>;
  onRouteChange: () => void; onSceneClosed: (route: string, selectionId?: number) => void; background: string; reduceMotion: boolean;
}) {
  return <ContentContext.Provider value={props}>
    <NavigationContainer ref={props.navigationRef} onReady={props.onRouteChange} onStateChange={props.onRouteChange} theme={{ ...DarkTheme, colors: { ...DarkTheme.colors, background: props.background, card: props.background } }}>
      <Stack.Navigator initialRouteName="tabs" screenListeners={({ route }) => ({ transitionEnd: ({ data }) => {
        if (data.closing) props.onSceneClosed(route.name, route.params && 'selectionId' in route.params ? route.params.selectionId : undefined);
      } })} screenOptions={{ headerShown: false, gestureEnabled: !props.blocked, animation: props.reduceMotion ? 'none' : 'default', contentStyle: { backgroundColor: props.background } }}>
        {WALLET_STACK_ROUTES.map((name) => <Stack.Screen key={name} name={name} component={StackScreen} options={name === 'receive' || name === 'governance' ? { headerShown: true, title: name === 'receive' ? 'Receive' : 'Governance' } : undefined} />)}
      </Stack.Navigator>
    </NavigationContainer>
  </ContentContext.Provider>;
}
