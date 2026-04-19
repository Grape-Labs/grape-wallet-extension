import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Grape',
  slug: 'grape-wallet-mobile',
  version: '0.4.0',
  icon: './assets/icon-app.png',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  assetBundlePatterns: ['**/*'],
  plugins: [
    [
      'expo-camera',
      {
        cameraPermission: 'Allow Grape to use the camera to scan wallet restore QR codes.'
      }
    ]
  ],
  android: {
    package: 'xyz.grape.wallet',
    permissions: ['android.permission.CAMERA'],
    adaptiveIcon: {
      foregroundImage: './assets/icon-android-foreground.png',
      backgroundColor: '#100312'
    }
  },
  ios: {
    bundleIdentifier: 'xyz.grape.wallet',
    associatedDomains: ['webcredentials:wallet.grape.app'],
    infoPlist: {
      NSCameraUsageDescription: 'Allow Grape to use the camera to scan wallet restore QR codes.',
      ITSAppUsesNonExemptEncryption: false
    }
  },
  extra: {
    eas: {
      projectId: '8cdfc344-97a9-4f7b-8852-2363c9c34a98'
    },
    env: {
      EXPO_PUBLIC_SOLANA_RPC_URL: process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? '',
      EXPO_PUBLIC_SUI_RPC_URL: process.env.EXPO_PUBLIC_SUI_RPC_URL ?? '',
      EXPO_PUBLIC_ETHEREUM_RPC_URL: process.env.EXPO_PUBLIC_ETHEREUM_RPC_URL ?? '',
      EXPO_PUBLIC_MONAD_RPC_URL: process.env.EXPO_PUBLIC_MONAD_RPC_URL ?? '',
      EXPO_PUBLIC_SHYFT_API_KEY: process.env.EXPO_PUBLIC_SHYFT_API_KEY ?? '',
      EXPO_PUBLIC_JUP_API_KEY: process.env.EXPO_PUBLIC_JUP_API_KEY ?? ''
    }
  }
};

export default config;
