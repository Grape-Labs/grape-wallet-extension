import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as LocalAuthentication from 'expo-local-authentication';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import WebView from 'react-native-webview';
import type { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, SvgUri, Text as SvgText } from 'react-native-svg';
import {
  Button as PaperButton,
  Checkbox,
  MD3DarkTheme,
  Modal as PaperModal,
  Portal,
  Provider as PaperProvider,
  SegmentedButtons,
  TextInput as PaperTextInput
} from 'react-native-paper';

import { DEFAULT_THEME, parseDeviceLinkPayloadText, type GrapeTheme } from '@grape/core';
import { chains, getMobileTheme, mobileThemes, type MobileThemePalette } from './src/theme';
import {
  addWalletSet,
  addPrivateKeyWallet,
  createBridgeActivity,
  createSwapActivity,
  createEmptyMobileWalletState,
  createSendActivity,
  createWalletMnemonic,
  createPrivateKeyWallet,
  createWalletSet,
  castWalletGovernanceVote,
  createMobileDeviceLinkSession,
  executeWalletBridge,
  executeWalletSwap,
  exportMobileWalletPrivateKey,
  importMobileDeviceLink,
  signAndSendMobileSolanaProviderTransaction,
  signMobileSolanaProviderMessage,
  signMobileSolanaProviderTransaction,
  signMobileSolanaProviderTransactions,
  type MobileActivity,
  type MobileAsset,
  type MobileDeviceLinkSession,
  type MobileSwapQuote,
  type MobileWallet,
  type MobileWalletState,
  getSelectedWallet,
  getWalletBridgeQuote,
  getWalletSwapQuote,
  isValidMnemonic,
  loadMobileWalletState,
  loadWalletReputation,
  loadWalletGovernance,
  removeMobileWallet,
  loadWalletActivity,
  loadWalletAssets,
  loadWalletAssetsFast,
  persistMobileWalletState,
  sendWalletAsset,
  updateTrackedGovernanceDaos,
  updateTrackedReputationSpaces,
  updateTrackedVerificationSpaces,
  unlockMobileWalletState
} from './src/wallet';
import type { MobileBridgeQuoteSummary } from './src/config';
import { getMobileSupportedBridgeDestinations } from './src/config';
import type {
  MobileGovernanceEligibleDao,
  MobileGovernanceResponse,
  MobileGovernanceVoteResponse
} from './src/governance';
import { scanMobileGovernanceDaoEligibility } from './src/governance';
import type { MobileReputationResponse } from './src/reputation';
import {
  createMobileDeterministicPasskeyWalletSetup,
  getMobileDeterministicPasskeyWalletSupportStatus,
  getMobileDeterministicPasskeyWalletUnavailableMessage,
  getMobileDeterministicPasskeyWalletPassword
} from './src/passkeys';
import { entropyToWalletMnemonic, type WalletMnemonicLength } from '../../packages/solana/src/mnemonic';

const GRAPE_LOGO_IMAGE = require('./assets/grape_logo_white.png');
const THEME_BACKGROUND_ASSETS: Partial<Record<GrapeTheme, number>> = {
  grape: require('./assets/bg_grape_dark.png'),
  comic: require('./assets/bg_comic.png'),
  matrix: require('./assets/bg_matrix.png'),
  tron: require('./assets/bg_tron.png'),
  apple: require('./assets/bg_glass.png'),
  'liquid-chrome': require('./assets/bg_chrome.png')
};

type Screen = 'loading' | 'setup' | 'locked' | 'ready';
type SetupMode = 'create' | 'passkey' | 'import';
type PasskeyRecoveryMode = 'passkey-phrase' | 'passkey-only' | 'trusted-recovery';
type ImportKind = 'mnemonic' | 'private-key' | 'restore';
type MainTab = 'home' | 'receive' | 'discover' | 'governance' | 'activity' | 'settings';

type DiscoverProviderRequest = {
  id: string;
  method: 'connect' | 'disconnect' | 'signMessage' | 'signTransaction' | 'signAllTransactions' | 'signAndSendTransaction' | 'sendTransaction';
  origin?: {
    origin?: string;
    href?: string;
    title?: string;
  };
  params?: Record<string, unknown>;
};

type DiscoverApproval = {
  request: DiscoverProviderRequest;
  origin: string;
  originHost: string;
  rememberOrigin: boolean;
};

const GRAPE_DISCOVER_DEFAULT_URL = 'https://governance.so';
const SOLANA_SEND_FEE_RESERVE_SOL = 0.00001;
const SOLANA_TOKEN_SEND_RESERVE_SOL = 0.0021;
const MOBILE_SWAP_SLIPPAGE_BPS = 50;
const PASSKEY_WALLET_CREATION_ENABLED = false;
const GRAPE_DISCOVER_WALLET_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAAGVn0euAAAABGdBTUEAALGPC/xhBQAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAYKADAAQAAAABAAAAYAAAAACpM19OAAABnWlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iWE1QIENvcmUgNi4wLjAiPgogICA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPgogICAgICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIgogICAgICAgICAgICB4bWxuczpleGlmPSJodHRwOi8vbnMuYWRvYmUuY29tL2V4aWYvMS4wLyI+CiAgICAgICAgIDxleGlmOlBpeGVsWERpbWVuc2lvbj41MTI8L2V4aWY6UGl4ZWxYRGltZW5zaW9uPgogICAgICAgICA8ZXhpZjpQaXhlbFlEaW1lbnNpb24+NTEyPC9leGlmOlBpeGVsWURpbWVuc2lvbj4KICAgICAgPC9yZGY6RGVzY3JpcHRpb24+CiAgIDwvcmRmOlJERj4KPC94OnhtcG1ldGE+CrgvSFcAABjESURBVHgB7V0HlCRHee6eDXenfEI5HJYQIJTRI5xlJcIDwxPBCCGULNmEBxJIFjbPzwbx1pb0wM9EG2xLYMmERzgJBSQOnYIXUBZnnYRY6Y69uLe3t2lmZ6ZnplNV//7+nq3emp7uSTu7dyddv7dbVX+qv6qrq6v/+v8aw5jPRbiYX6UNZZVF8KBOwEzqemxqan8dF+ULjryOC5YfPMDEFRHcw+Uxi97Aac1le/QjBjAhp55PT3MavzIKIPzgUZXntK/XeAunSgDn6y6FdJ3gLkaOjlaO4VTBOV9zMcKx6DOc0irq4YQJVFpDrArjG+kwzguPQhWlT1mFS0xZmhRByc3Jf3Qm6J0NpSsJ7na6kPMtEYeEkiQV6L1imi5XQuafbnLdUzcTvZolCQrKukRdNVNH6PkaItOM6KI7zcRlT35/S4mOWE20ZNoR54POLAtarQuK8hMlOk0Vhgp0MOdVLTKgGhVDurItbwSiILmHcHl+8BKnFUf+G6dKWF06Olp8FQMdW/5HHTIJwNL0Kz9OxyXRhTDfpi+nItMQAwZlVA1ega5Io4vgXoXCBycCtJIhQQ7X0gptDU2F6Elm9PFcnT842FuDnE8hTRsnCNbO+PKLSbKZZ8IVH0rCtQVLqzxNSM3YVkQspOTLz0+W6AzO+zLIPj9Oh3GeaRwRrB7K2Su4zNeLU3SkJ2mI80pGagqaQCGfeIKWuR79typbLt1cLFI4khkWF5i1xIc9ojMUfWrKjHyN59xTmGjDhuIhXFYMpZK4Si97XrCWy75P6xRN0xQPaUkRFafpRLdCf6/Kvhv8SuVVqleoYE1TZuJLJ0wqx2E6fcOx7eaND2AUHKgzUECeXuY8T3RxWFtlzGg+BNe1RNj0eFuCGhGjAqHjG3WLTtdWfmiA+qVF17bFtMuIh133ZO4GvopS/ldXFWGhmNiGldBpIS5nmConpVNCXIq/TyThamB4BYoRz3tzDXC2kFbJTt8/Lw1XJ6cR4Ywnr2V8/PID2lknqFMAHodoMmxFRuJ0zYwlP3hwR9l7YzUvv1bw6Uuc50fWlfTjgkuXcLngyc/agm7hfNJVV0HRlf/CXTCaN686ZGnv7Zy3neA+IzD+yHkIMafK7kCPabylWs70llz/lllcUh21MJ1QzzOVXnYE3bmj6Lxe59bxOrwmrxPpeSbSy3peCUiCpc6m09N0tBKaLforl/T2nK7KmDszeLk8pwS2NZtOTdFRzMiX0iwISOIFFC0hGee61U8XValOr/hS0zhxszLe0+8rlejSJIF1oyiJqBlMlIzne8ioueENecrQSAraxESsvbqwrvx3lec0mO02zjcUmITEi/33zDi0ivoVHkXplulmVfadYA3TlKcpce5SdKkpM+vIeJlxSTCdp+17UNpMh+sC5pX3LPndYPZrkzXFS/7WwKMXldYqnVclbpYujgtyc3TZLGx+yxWlWbwChifBFL2etn0PmNmfoHfJkvFtXdC886yxl6XrgjLd36r2XGnLLeAJLRMYk2LG+EJbk9u8m7YnCVgzPr4vPjjLfAsaXVYQ/Hy+7ZqRsnsrVHwdHagUHvP9dzVTrhIEjzG9FwS5ZrRx/O1btixVdcVxHZXHHXEBCywHwb3tClCKuEGwdcz2z0njz7riQkFkKfqsEH+VRrvocFbKDWhjScgfiiCA6aP28nGXij599b6xsX0WXblWKoTSocat0HZC0/I0Z7nyxtq+q5bwqeJ7MtiYhKv4wV09sx/PSfgSTIpJcBgCK8YAtaxbw4YPbqHUh6riyi+zAo4frEkSopSbLPpn6/i1Y7QP4/je6HCVz7vyHxjv+sHvFKzjVGDVxsKSBDAcyteY4RWd5cirGT85Q+HXkYJzih52GafD4vmKQ59nmpEJ5zVxnF5u5TbN6AzxfG/GXBGHcRlfDn/kdMlS4yRO9QuqF7m8evXwkouwK6DjVL4nY5zMeVlZ0tj4rxgapdwTfBXL9IFCyf/zaglDICAbf4/jLuUVTAjaruVHfT94SpU5lcHsU815SS94Yu75QTkfKi1pkmlLFfm5Rnq1hRsepiWsMAvGZ0zNmFaCGMeXKuvpxETpcMahgeHHho5TecgP7dLlsrxBwbqasgLYqhlJEsqWdMaXCsnfZ55LobkziVfBhoZoP5bhedTdpaiqQEosRnGpskoHB6nXteWPGIepJcAW2b2b1lKNgRIN/EaIRi/7+KxwCvQexa9S36GfM01+wjlewbqeYkdtR6iIxB5NgcKZhsuVvPiIqsyaobcxTL98l1YPr6YlTJMdpgPQiOcZj29Tz6vIbyva/AQ1nHVUHfNOrWl6O1fKPZsmTCmVhmc402Dsy0Y0C4KTDn2LK9/0UK5mqOiVMR7D4gEdFs9LtzprxeGLUmYFeczHKxMOPRjiYv9KE3MbjMzjzdAVTILP7Z/GZSxaGXfihZierFDdLrq9mV4dp+MyNp4X7oFtpxesZ+lQVkiW6OuN+JgGxo7pRjTt4FpZSrQkr3epEa7n8aK1mzFggRoZtJrRLioeb4l7uYdFme6MVzw5WH1JMZ4M6o7FJ15Jt8qBU7V/hcpq/8TO+pdXt+rcK2dvDyxmD2Sl/Cfs8ha04c3r4KFR8t+xmHq0XVee5E260mn59dTAT6aFWjeRvWLEt89tgbR1EnzEDiuFYfb72zgnFvuH2FS1yDHduBDhbmCcrpWyqqcV2pZoYCr8HQuFXXR7M4ZNRK9VCmwmOr0ZfRwPC+A9zI998NviuI7K474fLpvZgtaqgKFC4WDViFZ5mA777M8yH9ua2uFrSFu1q9V/hTVkAjLry79TjUBvfvWpLB2QxPNimY6sSPkzRYuOipxmkujbhrFgeIXe3TYjGJRSraZ5X36hk3oa8wwMdLzgs0XwECu/0xNXwcCLyan24rsL+FPTPr2zsRK7CDvlio+yytPlZDePbqjVce+2VLnZE1rnfDNzXEv0HRC11YBxl04tC3k7e4QU/VqrmSXoIjjv3QmPkB9N2f7bWJc+aSznNCDDLrhygPng/PfNDdOV0JuBcdtL7qm2kN8F7n44U1/NsK5fA7D7wM4fGmRrRzEMWZ78YRymymU/uEPl46kX0BZl5I3jrG4/zKoCuEK+NFWmM9ktEr11PR5CTNnVq+TRNzZW6NjRovM6WKxXKzin/LDmKuKSp2BexN05X8hgXOFhQn+B3THXT5WPwt2Jpl54TN7UlTuBCsKXCzY4vhQXqJQYmpzcL46btqsOX+jluhcgOiJ0eCk69UsSlqPksj02LrftMguD4akSZyzYVYeAkkPXx3FchsV6J/MOYvjF8QxHw6w4XJV3Wu5JTGNjeCpYR+kIzHwsqOzW+wd7gh5lXJpgxkHJGrdHpp0uuicyruTUTgJxOUzDmytxeLzccBY6Yrkfvv6FzGyMM+KuHBGH1ZXJqBs+PWbmMKZzPNpcRx8DZExjWQxUV2zYgB07+rYwR39P8L44p2mYofHq2WHr0DiOy3xvMhmjDpctO+sZv++Snvc9sZ0aKoiHfyfTzuviW8mXLgS9959V6Nx/168GLFx00aoehBhsmMNUc8Wy+BjLmMp7b4rjsDMzs3WqfKSqAyELA0xTduhTCtZxWqrQ37AwVDLFQpAWucwX8i9hCymcUbiMYcUzZnTx9hJ2ZEYVAD7dW1We5YD+SaTR+yVfoncWyvQeRdOx0nFGXUkWjh2UZ+I0cNWLXmjYSwt7W6eBslmlGDuv67hsliKHXkUDF8Hojui0Heexb/VFFg5FnCQh5TJ9ivEVbFYk4dHT4ctrdHTOnV+n43035gedvb3Js6HztZxn30SuAIq+P4kJnoKhgkk4hjGvEEG4C9mIhunS8EnwhrOQztDfb5zF5XLZ+F8drvKZHiPVX28AsTdMJ6X5G0WflKL3R5LgjWAtN0C6Qbjh3Ndn1IxfJTwIDE/l4+mAYQYMy5h0TBynl+FqFq5edVjX8rxzyLcXO5C/iAuFs+kFeDZCfx8Mpa12ia7UaXjHknn5Qi/PuDbdPjhQH2bEeMjp7jexrghXwJe+kwiF6nyAqlTVdZBToW+qcjwtWxSt/30vCJ3A2fNWr7OreVZcKYHdye/wFimXpUfPqX1h3koV2FJVdCq1Z+h8pYxr0UUKjkjKT7EbMJd5C1fRLFjKrsCqck6xC/nLpMpca84MmYQfHJzzjQvlwB05iW7BYBir4cdMWgWeRZ9kxdw8XZxKU5LhVi3vOafRLBiclcMtT92sw1brb5kGb4DU7aQJuEozTUdxkbMta3kaTewJeK8kwgHEe2F2I89MfTH15YzwrY5lc7hBmCarEXxeDcj0m6nzunSNJ7liuHdfmKbAvscb4Yzj28YjaTQLBufddb79mF2u0Ctxx+lUhscv0D+s03Ged/mZLg5ftLJS0psRf8mV2tP0DgVjT30OAYfit0QwUX1J8dKCPfsZzl7+i6ZwvCJ2E1DK6Sm7FcRphR08rdNwnt0U4nS7omyilx9XyrlT4rI0JRQNJmCfQx/S6HYJnP0fWMFGlbMfBdOwX0UjunZw85qF9IrMXuNVejkpL/LGEwxfcqLRNWNv1xoAC1DTVWTvgUYYPC23GhNJDdylMGFV47Q4ACZNEUya8LJvPMzSeBcczh4orFx4raF94xXCkyX0SGSPljhutymLHF2u2oBIgftQfq+coesw62AjHxeOpthtlE1ThF1qVCP0lF1w0nh2S7g3SqdzqLmYoks47Hy3VHKvUnt7IIw0X9xuIMN80bFXLF/ae7wv6bgDzZ79YIU3LJiVMA2P5Hrk1keM/k3Xmqa7uIq9TGvb6nlnlkj+GC4cqdYjfbLV82wzgKPP4xNC/MXLtHsW5gnYRnQ8Fsu3YfPovHjHYSWUhwV1LTynng4yxHtNCDsk6u8194Od5nV9Zs+b+k3zrXhrHBXn9Qzanjfkxw83+x6M4xa6/ATRsjOIHltmmmdiLWEjoPS8Ff39848R66biGx3nBOwVbdZHMdwTnLyUNz8BD65268ImWS8HhSKQdKxGJuwI8Mf7QLvyOqV/1rIO5RNblA4YL+Utrntip/IWhA8HoH1HKcgpOm3LZtc9rVuVrSM6CL6Aa/Q67ICe4fjsbtURl8ODBnXeqdeJ8OjxzbZdZ6+I8y5aGZ6ifQjki+wRUDbAmT5XLpQCI657Ct4nM6pTMBqL8CG+/qVi9Ty7+da7zXVPsqS8Ne5YhPeRzEl5zXzlx/lTTcZxwrQyXBnv3afHDLcsoaQ7LsyVx/Sbz6XRdwOOs932PfEwY22/adRNA7wLJ8jYKgx6Hl4iLxgmDcMfJttPPYX9eg2vIIx9MqZcvo9p8m7kSb1m5rReg07pNc1Ecwq8EddlA/nZo/v6unfqVzc6QckY97yVmG6ewRz56Db49yj4QqfsFSaCuehZxOzUuDeoJ6TdFB3+IvutDlca76R2q33zfgK6pUgncgq+/OcDejM3MK8kI/9/JeOEtx5gZgeJlp7gGsfu0yOO6yPzGGGaR+IErP3xvWGKwPCX9mamPJKTODx2W8nwt71+2bIxnJjX0BraiX4ve56cT3+mj/AdZbFwO8sL1Jtds+gukH4NxWawNQ1X4OjabcMCIw0XKTNp+2fD3f5+/gbQR6ieB86z4T89bVc3trci+AHeul/jMwN1unjelcFzRY/+Gk5HZtETV2p4CdxIoxcBDmedLPn0rdHZ+T1n0zk44e+XTfSsVATdPV7xVi5S93VWzSCccnG68m1ah0RZNFDiyJUcbD9ZvDixcmztQodhmqdJuFeHJ0C0xlWlYh7czEmW0SofjrkQrCPryjon8VmevIX93zvrpQXiypb8d7NjsVKYRyEc8b++KVd7GINe/TBOSUHn5BUPp+ixR+InN+o8nM/Z4jIsL0OPPJ0XN3Yq7zbe65wuy2t0HugpLZ9uHpqkOnd1Ve8wwpVKrvxX3JyIlds6XfJ3j0CZmbJ4f6QZMjhECHtG6S4p3LBxiw5Dh00oPnTo6PZK9VBK1fBGKc42j7b7WUZ+1g24EU+2Ij6i6uO04smfNKJPwlV8qongyJXFBUl0iwZjZ210XmQjQaTGQ61UjjiA76nOAP/Mdi2Gphn/jE3nK15OcW5R06/Tp4azByDIYkTxQc86R8Vm9Sq8Ho2CqWq4mcO64luQFM67Z+BxjJ7NAqaHZhXdDtc4RLFEMXDqhxya8Sm8ZdONqiNR9zQ/TQqXluKY17MiJcGctejDabTN4Djc/GKt/gChQuFefTO+NPy8lqGW6/kGGUIJhym5qcVz22/+xMPXH6wD1QubMIkmAIWPp1hqznlbE+2Hw18PitPEy0uW9FrQM9qR7uuVTXniMlR5ad+cLzE8DPxi0di1G0cI0/iVGhFwRZ/YiDP4lbJJ6WSBXuu4wV2Kh1PXCzY6XvCgjUAxjNY/TeJjGL8QrbL8NE5lilYovgiyvqDHbUfealXoQ+unaP8kfugZWVLhWlxCnS/hbxP+1rmC7sARap+ZaHKoy9gYHYLVVbRMRjseSKprUWHDO+lQzOPhCU/cmZgWyggbeYeuRN6it4NmM+NbvSCnhHiZa7YiagOdFzqFtMrLdOicO3gwcMwNOjw6dLIVGdggGp6Z8c+Lt0Edx8Uy0J6xnVb3nLT0utrO4yCyfoTQ1Jx/hFWbsG35UzwVNUtGdEa2jHkc8/DJ+HZYypWtwrl4GF0r0FmfxBHc0fshqbNcN7inUPDfPbR9boNnaKhwcD7vvwshOzVPVpwfYT8bEGxy9fi4fdyqVUOhqwafkJgr0am2TTexbjoPymNow/+gLa4OR1sf6kpEZNs93YSBf6MIyj2sK6vy6NihkZFy3TZjksjJSToCjY9s/hh5vmU1XuPrctBp1cPhZivHjfkJfyjqNGl5PkqddVV66ykCxgbHxuwVaby7DZxHMzqwpJR3nOCO1pUjk0eY4uUbwfJa5a9Y9FHFy6llNV+mJsnGTfuZksNtQVDbsUl0uyWsrEVp4HVZzLXRgRjpJ6PBvmq8U0kOjk5ruNBetjg1kN2aOzK5Z3fQsdA9MmNwm9LqnA98XsvQtIr7+jLRMg/GyrzorQ8fTuOFzR6bVUY0XQg/M55GG4cPGAMZLA2jkDOEsE0iBE2zl8Y50ssyb8zA0hotefU2pXPtJhhMA7Wf/VZ6rEZcZbyQ+zlkTj0BOAtzzfBTycfHxHm57Dr0FcWLJ8nK5fyzeV5X52km8STBijPig0oOp9ymJLrdEgZ9TQSRRevuAC/RUjb9YHY7R2d7TvCo3uC0PML61pcK4tJ4w628uBhTzktpfDocdL+uFOmsuAxVtqZwKKq28pn9zYyOpjIlc9FTXlpyJF+s4esr2bmGVwry+jlDxhwlfpNxKxp9n1uiHyC9AzFpf5j79Jqjc8r0PfzVGOYYy7S4UX8A7yrI+D7SX0DmljnO2RzsE9DhOtU5xQn/LIRO1txEbgO3RdHscak16Z+LKWWqrvExAOJHf7xl3Uz07khq6ACOXMevudyAm6abdqqSAGMc0yTxKtjMFjrIrcydehVTIyqyzngyz1F8e3ya/z0tRwzrjQEOYtBM6zxapxv+xGRCy/Mj9Brw2aq3MLqfaXeO5+BhdHJOyWCdWDcbOrKuCdW+PEBekT6mGo1xLHn+b7dlOIj6B0oGOm1ibAMlBvI3k2tN0rno+OhpYt2a8XQb3/Bx7XZlLC/TZ7xZyQ18Y9vmh43nVLm1lMze/swbFC2iYn931OvN1LhlRZeU7nhyeh3ODNymcLpuCrbQ6aLfAByOv101CsF9hx+90mUPtTYuE6c6G5OKIdNLx3Pwqyq3kx7xxkMOgw6R9VbXrR05exTt1Ho6CquayM6DyPrBVjqQ+AU8Qx8UFbob004YVqqmIZ5EIHMSsu51p+lDqy5qvmrhlzXXrWSwTqzbHtWZnSqLYMqzOGA4arygrD2Z/C5wpsQFiONtuopSslQq/WDayVHini3XhZs4Z/mELqxTp+3ZI/kKQ3Qwws2fVR2mUozKX3t5+oQ97r8dMfeI9Zi7UN7MP2Y3tpbqjmhgGOOYZo4DT4ZLIz4+rPCC/Ti8lAZ1HOdZB9Zlj+zEbihdxmOPaaWhHR+dujW3qXUzsL2JVuDUypqbF+94rpPr7kYbXjYyEC6d8bbTW3jUqg5D5w/B72JJu43cgs1/3ITIrs8yWTbX0a6sVxS9N0Gn4yMLxoTq5U3TVZ12AH595Colh2Wy7E5lLRRfZPZdqAraldvXj8BBzewFW3LkddGurIzmsQETtxHKblfIK40eP4XVh6kj+skaeIU+g5PC2jaGEQxoIe/sIxDKhOxXWn921F5vnFZiypjzNXUQJtTGngCBFiueddr0I1hmR8q8UpncYToZ6/8a512M6N+iI9+a1ic4oGIlaGr2FVgGy0rj2Qtv0gMyR5/Gs1DjFqJGdsMUPMzbRPxedKs9kH+UluPwm8/hwIPn8BUbfUWrm8AwxjEN07Yqdy/d3h7Y2wO7sgf+H7nH/6XkToLfAAAAAElFTkSuQmCC";
const GRAPE_DISCOVER_WALLET_ICON_JS = JSON.stringify(GRAPE_DISCOVER_WALLET_ICON);
const GRAPE_DISCOVER_FAVORITES = [
  { label: 'Governance', subtitle: 'Participate in DAO proposals', url: 'https://governance.so' },
  { label: 'Grape DAO', subtitle: 'Open the Grape governance realm', url: 'https://www.governance.so/dao/By2sVGZXwfQq6rAiAM3rNPJ9iQfb5e2QhnF4YjJ4Bip' },
  { label: 'Verification', subtitle: 'Manage verified identities', url: 'https://verification.governance.so' },
  { label: 'Jupiter', subtitle: 'Swap on Solana', url: 'https://jup.ag' }
] as const;

const GRAPE_DISCOVER_INJECTED_JS = `
(function () {
  if (window.__grapeDiscoverInitialized) return;
  window.__grapeDiscoverInitialized = true;
  if (typeof window.Event !== 'function') {
    window.Event = function Event(type, params) {
      this.type = type;
      this.bubbles = !!(params && params.bubbles);
      this.cancelable = !!(params && params.cancelable);
      this.defaultPrevented = false;
    };
    window.Event.prototype.preventDefault = function () {
      if (this.cancelable) {
        this.defaultPrevented = true;
      }
    };
  }
  if (typeof window.CustomEvent !== 'function') {
    window.CustomEvent = function CustomEvent(type, params) {
      let event = null;
      if (window.document && typeof window.document.createEvent === 'function') {
        event = window.document.createEvent('CustomEvent');
        event.initCustomEvent(type, !!(params && params.bubbles), !!(params && params.cancelable), params ? params.detail : undefined);
        return event;
      }
      event = new window.Event(type, params);
      event.detail = params ? params.detail : undefined;
      return event;
    };
    window.CustomEvent.prototype = window.Event.prototype;
  }
  const pending = new Map();
  const listeners = { connect: new Set(), disconnect: new Set(), accountChanged: new Set() };
  function randomId() {
    return 'grape-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  function normalizeBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    throw new Error('Expected Uint8Array-compatible bytes.');
  }
  function bytesToBase64(bytes) {
    const normalized = normalizeBytes(bytes);
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < normalized.length; offset += chunkSize) {
      binary += String.fromCharCode.apply(null, Array.from(normalized.subarray(offset, offset + chunkSize)));
    }
    return btoa(binary);
  }
  function base64ToBytes(base64) {
    const binary = atob(base64);
    const output = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      output[index] = binary.charCodeAt(index);
    }
    return output;
  }
  function decodeShortVec(bytes, start) {
    let value = 0;
    let offset = start;
    let shift = 0;
    while (offset < bytes.length) {
      const next = bytes[offset];
      value |= (next & 0x7f) << shift;
      offset += 1;
      if ((next & 0x80) === 0) {
        break;
      }
      shift += 7;
    }
    return { value, offset };
  }
  function applySignedPayload(transaction, serializedBase64) {
    try {
      const bytes = base64ToBytes(serializedBase64);
      const decoded = decodeShortVec(bytes, 0);
      const signatures = [];
      let cursor = decoded.offset;
      for (let index = 0; index < decoded.value; index += 1) {
        signatures.push(bytes.slice(cursor, cursor + 64));
        cursor += 64;
      }
      if (Array.isArray(transaction.signatures)) {
        if (transaction.signatures.length > 0 && transaction.signatures[0] && typeof transaction.signatures[0] === 'object' && 'signature' in transaction.signatures[0]) {
          for (let index = 0; index < Math.min(transaction.signatures.length, signatures.length); index += 1) {
            transaction.signatures[index].signature = signatures[index];
          }
        } else {
          transaction.signatures = signatures;
        }
      }
    } catch (error) {
      console.warn('Grape Discover could not apply returned signatures', error);
    }
    return transaction;
  }
  function createPublicKeyLike(value) {
    return {
      toBase58: function () { return value; },
      toString: function () { return value; },
      toJSON: function () { return value; }
    };
  }
  function base58ToBytes(value) {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const bytes = [0];
    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];
      const alphabetIndex = alphabet.indexOf(char);
      if (alphabetIndex < 0) {
        throw new Error('Invalid base58 value.');
      }
      let carry = alphabetIndex;
      for (let inner = 0; inner < bytes.length; inner += 1) {
        const next = bytes[inner] * 58 + carry;
        bytes[inner] = next & 255;
        carry = next >> 8;
      }
      while (carry > 0) {
        bytes.push(carry & 255);
        carry >>= 8;
      }
    }
    for (let index = 0; index < value.length && value[index] === '1'; index += 1) {
      bytes.push(0);
    }
    return new Uint8Array(bytes.reverse());
  }
  const STANDARD_CONNECT = 'standard:connect';
  const STANDARD_DISCONNECT = 'standard:disconnect';
  const STANDARD_EVENTS = 'standard:events';
  const SOLANA_SIGN_MESSAGE = 'solana:signMessage';
  const SOLANA_SIGN_TRANSACTION = 'solana:signTransaction';
  const SOLANA_CHAINS = ['solana:mainnet', 'solana:devnet'];
  const WALLET_STANDARD_ICON = ${GRAPE_DISCOVER_WALLET_ICON_JS};
  const walletStandardListeners = new Set();
  function getWalletStandardAccounts() {
    if (!provider.publicKey) {
      return [];
    }
    return [{
      address: provider.publicKey.toBase58(),
      publicKey: base58ToBytes(provider.publicKey.toBase58()),
      chains: SOLANA_CHAINS,
      features: [STANDARD_CONNECT, STANDARD_DISCONNECT, STANDARD_EVENTS, SOLANA_SIGN_MESSAGE, SOLANA_SIGN_TRANSACTION],
      label: 'Account 1',
      icon: WALLET_STANDARD_ICON
    }];
  }
  function emitWalletStandardChange() {
    walletStandardListeners.forEach(function (listener) {
      try {
        listener({ accounts: getWalletStandardAccounts() });
      } catch (error) {
        console.warn('Grape Discover wallet-standard listener error', error);
      }
    });
  }
  function emit(event, payload) {
    listeners[event].forEach(function (listener) {
      try {
        listener(payload);
      } catch (error) {
        console.warn('Grape Discover listener error', error);
      }
    });
  }
  function post(message) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }
  function originPayload() {
    return {
      origin: window.location.origin,
      href: window.location.href,
      title: document.title
    };
  }
  function request(method, params) {
    const id = randomId();
    return new Promise(function (resolve, reject) {
      pending.set(id, { resolve: resolve, reject: reject, method: method });
      post({ type: 'grape-provider-request', id: id, method: method, params: params || {}, origin: originPayload() });
    });
  }
  function serializeTransaction(transaction) {
    if (!transaction || typeof transaction.serialize !== 'function') {
      throw new Error('Transaction serialization is not available.');
    }
    try {
      return bytesToBase64(transaction.serialize({ requireAllSignatures: false, verifySignatures: false }));
    } catch (_error) {
      return bytesToBase64(transaction.serialize());
    }
  }
  const provider = {
    isGrape: true,
    name: 'Grape',
    icon: WALLET_STANDARD_ICON,
    providers: [],
    publicKey: null,
    isConnected: false,
    on: function (event, listener) { listeners[event] && listeners[event].add(listener); },
    off: function (event, listener) { listeners[event] && listeners[event].delete(listener); },
    once: function (event, listener) {
      const wrapped = function (payload) {
        provider.off(event, wrapped);
        listener(payload);
      };
      provider.on(event, wrapped);
    },
    connect: function (options) {
      return request('connect', { silent: !!(options && options.onlyIfTrusted) }).then(function (result) {
        provider.publicKey = createPublicKeyLike(result.publicKey);
        provider.isConnected = true;
        emit('connect', provider.publicKey);
        emit('accountChanged', provider.publicKey);
        emitWalletStandardChange();
        return { publicKey: provider.publicKey };
      });
    },
    disconnect: function () {
      return request('disconnect', {}).then(function () {
        provider.publicKey = null;
        provider.isConnected = false;
        emit('disconnect');
        emit('accountChanged', null);
        emitWalletStandardChange();
      });
    },
    signMessage: function (message) {
      return request('signMessage', { message: bytesToBase64(message) }).then(function (result) {
        return {
          publicKey: createPublicKeyLike(result.publicKey),
          signature: base64ToBytes(result.signature)
        };
      });
    },
    signTransaction: function (transaction) {
      return request('signTransaction', { transaction: serializeTransaction(transaction) }).then(function (result) {
        return applySignedPayload(transaction, result.transaction);
      });
    },
    signAllTransactions: function (transactions) {
      return request('signAllTransactions', { transactions: transactions.map(serializeTransaction) }).then(function (result) {
        return transactions.map(function (transaction, index) {
          return applySignedPayload(transaction, result.transactions[index]);
        });
      });
    },
    signAndSendTransaction: function (transaction) {
      return request('signAndSendTransaction', { transaction: serializeTransaction(transaction) });
    },
    sendTransaction: function (transaction, connection, options) {
      if (connection && typeof connection.sendRawTransaction === 'function') {
        return provider.signTransaction(transaction).then(function (signedTransaction) {
          if (signedTransaction && typeof signedTransaction.serialize === 'function') {
            try {
              return connection.sendRawTransaction(
                signedTransaction.serialize({ requireAllSignatures: false, verifySignatures: false }),
                options
              );
            } catch (_error) {
              return connection.sendRawTransaction(signedTransaction.serialize(), options);
            }
          }
          throw new Error('Signed transaction cannot be serialized.');
        });
      }

      return request('sendTransaction', { transaction: serializeTransaction(transaction) }).then(function (result) {
        return typeof result === 'string' ? result : result.signature;
      });
    },
    request: function (args) {
      if (!args || typeof args.method !== 'string') {
        throw new Error('Unsupported provider request.');
      }
      if (args.method === 'connect') return provider.connect(args.params);
      if (args.method === 'disconnect') return provider.disconnect();
      if (args.method === 'signMessage') return provider.signMessage(args.params && args.params.message);
      if (args.method === 'signTransaction') return provider.signTransaction(args.params && args.params.transaction);
      if (args.method === 'signAllTransactions') return provider.signAllTransactions(args.params && args.params.transactions);
      if (args.method === 'signAndSendTransaction') return provider.signAndSendTransaction(args.params && args.params.transaction);
      if (args.method === 'sendTransaction') return provider.sendTransaction(args.params && args.params.transaction);
      throw new Error('Unsupported provider request method: ' + args.method);
    }
  };
  provider.providers = [provider];
  const walletStandardWallet = {
    version: '1.0.0',
    name: 'Grape',
    icon: WALLET_STANDARD_ICON,
    chains: SOLANA_CHAINS,
    features: {
      [STANDARD_CONNECT]: {
        version: '1.0.0',
        connect: async function (input) {
          await provider.connect({ onlyIfTrusted: !!(input && input.silent) });
          return { accounts: getWalletStandardAccounts() };
        }
      },
      [STANDARD_DISCONNECT]: {
        version: '1.0.0',
        disconnect: async function () {
          await provider.disconnect();
        }
      },
      [STANDARD_EVENTS]: {
        version: '1.0.0',
        on: function (event, listener) {
          if (event !== 'change') {
            return function () {};
          }
          walletStandardListeners.add(listener);
          return function () {
            walletStandardListeners.delete(listener);
          };
        }
      },
      [SOLANA_SIGN_MESSAGE]: {
        version: '1.1.0',
        signMessage: async function () {
          const inputs = Array.prototype.slice.call(arguments);
          return Promise.all(inputs.map(async function (input) {
            const result = await provider.signMessage(input.message);
            return {
              signedMessage: input.message,
              signature: result.signature,
              signatureType: 'ed25519'
            };
          }));
        }
      },
      [SOLANA_SIGN_TRANSACTION]: {
        version: '1.0.0',
        supportedTransactionVersions: ['legacy', 0],
        signTransaction: async function () {
          const inputs = Array.prototype.slice.call(arguments);
          return Promise.all(inputs.map(async function (input) {
            const encoded = bytesToBase64(input.transaction);
            const result = await request('signTransaction', { transaction: encoded });
            return {
              signedTransaction: base64ToBytes(result.transaction)
            };
          }));
        }
      }
    },
    get accounts() {
      return getWalletStandardAccounts();
    }
  };
  function registerWalletStandardWallet(wallet) {
    const callback = function (api) {
      if (api && typeof api.register === 'function') {
        api.register(wallet);
      }
    };
    try {
      const navigatorWallets = window.navigator.wallets || (window.navigator.wallets = []);
      navigatorWallets.push(function (api) {
        callback(api);
      });
    } catch (error) {
      console.warn('Grape Discover wallet-standard navigator registration failed', error);
    }
  }
  window.__grapeDiscoverBridge = {
    handleNativeResponse: function (response) {
      const pendingRequest = pending.get(response.id);
      if (!pendingRequest) return;
      pending.delete(response.id);
      if (response.success) {
        pendingRequest.resolve(response.result);
      } else {
        pendingRequest.reject(new Error(response.error && response.error.message ? response.error.message : 'Provider request failed.'));
      }
    }
  };
  window.grape = provider;
  window.grapeSolana = provider;
  if (!window.solana || typeof window.solana !== 'object') {
    window.solana = provider;
  } else if (Array.isArray(window.solana.providers) && !window.solana.providers.includes(provider)) {
    window.solana.providers = window.solana.providers.concat(provider);
  }
  registerWalletStandardWallet(walletStandardWallet);
  post({ type: 'grape-provider-ready', origin: originPayload() });
})();
true;
`;

function chainMeta(chain: (typeof chains)[number]['id']) {
  return chains.find((item) => item.id === chain) ?? chains[0];
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatActivityTime(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatWalletSource(wallet: MobileWallet) {
  switch (wallet.source) {
    case 'created':
      return 'Created in Grape';
    case 'imported-private-key':
      return 'Imported private key';
    case 'imported-mnemonic':
    default:
      return 'Imported recovery phrase';
  }
}

function maskValue(value: string, privacyMode: boolean) {
  return privacyMode ? '***' : value;
}

function formatWholeNumberString(value: string | null | undefined) {
  if (!value) {
    return '0';
  }
  try {
    return BigInt(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatGovernanceVotingPowerType(
  type: MobileGovernanceResponse['proposals'][number]['votingPowerType']
) {
  switch (type) {
    case 'community':
      return 'Community';
    case 'council':
      return 'Council';
    case 'delegated-community':
      return 'Delegated Community';
    case 'delegated-council':
      return 'Delegated Council';
    default:
      return 'Unknown';
  }
}

function buildGovernanceProposalUrl(daoId: string, proposalId: string) {
  return `https://governance.so/proposal/${daoId}/${proposalId}`;
}

function formatGovernanceVoteSourceLabel(
  source: MobileGovernanceResponse['proposals'][number]['voteSources'][number]
) {
  return source.isDelegate
    ? `delegated power from ${shortenAddress(source.governingTokenOwner)}`
    : 'your voting power';
}

function formatRelativeTimeFromNow(targetUnixSeconds: number, nowUnixSeconds = Math.floor(Date.now() / 1000)) {
  const deltaSeconds = Math.trunc(targetUnixSeconds - nowUnixSeconds);
  const absSeconds = Math.abs(deltaSeconds);
  const safeFormat = (value: number, unit: Intl.RelativeTimeFormatUnit) => {
    try {
      if (typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat === 'function') {
        const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
        return rtf.format(value, unit);
      }
    } catch {
      // Fall back below for Android/Hermes builds without full Intl support.
    }

    const absValue = Math.abs(value);
    const label = absValue === 1 ? unit.slice(0, -1) : unit;
    if (value === 0) return 'now';
    return value > 0 ? `in ${absValue} ${label}` : `${absValue} ${label} ago`;
  };

  if (absSeconds < 60) {
    return safeFormat(deltaSeconds, 'second');
  }
  if (absSeconds < 3600) {
    return safeFormat(Math.trunc(deltaSeconds / 60), 'minute');
  }
  if (absSeconds < 86400) {
    return safeFormat(Math.trunc(deltaSeconds / 3600), 'hour');
  }
  if (absSeconds < 604800) {
    return safeFormat(Math.trunc(deltaSeconds / 86400), 'day');
  }
  return safeFormat(Math.trunc(deltaSeconds / 604800), 'week');
}

function getGovernanceProposalTimeMeta(
  proposal: MobileGovernanceResponse['proposals'][number],
  nowUnixSeconds = Math.floor(Date.now() / 1000)
) {
  if (!proposal.votingEndsAt) {
    return {
      badgeLabel: proposal.canVote ? 'Vote now' : proposal.hasVoted ? 'Voted' : proposal.state,
      badgeSuccess: proposal.canVote,
      badgeWarning: proposal.hasVoted,
      metaText: null as string | null,
      noteText: null as string | null,
      votingWindowOpen: true
    };
  }

  const votingWindowOpen = proposal.votingEndsAt > nowUnixSeconds;
  const relativeTime = formatRelativeTimeFromNow(proposal.votingEndsAt, nowUnixSeconds);

  if (votingWindowOpen) {
    return {
      badgeLabel: proposal.canVote ? 'Vote now' : proposal.hasVoted ? 'Voted' : 'Ending',
      badgeSuccess: proposal.canVote,
      badgeWarning: proposal.hasVoted,
      metaText: `Ending ${relativeTime}`,
      noteText: null as string | null,
      votingWindowOpen
    };
  }

  if (proposal.stateCode === 2) {
    return {
      badgeLabel: 'Finalizing',
      badgeSuccess: false,
      badgeWarning: true,
      metaText: `Ended ${relativeTime}`,
      noteText: 'Voting has ended. This proposal is awaiting on-chain finalization.',
      votingWindowOpen
    };
  }

  return {
    badgeLabel: proposal.state === 'Completed' || proposal.state === 'Executing' ? proposal.state : 'Ended',
    badgeSuccess: false,
    badgeWarning: false,
    metaText: `Ended ${relativeTime}`,
    noteText: null as string | null,
    votingWindowOpen
  };
}

function buildOgReputationSpaceUrl(daoId: string) {
  return `https://reputation.governance.so/dao/${daoId}`;
}

function buildVerificationSpaceUrl(daoId: string) {
  return `https://verification.governance.so/?daoId=${encodeURIComponent(daoId)}`;
}

function getAssetSubtitle(asset: MobileAsset, selectedChainLabel: string, selectedChainShort: string) {
  const normalizedName = asset.name.trim().toLowerCase();
  const normalizedChainLabel = selectedChainLabel.trim().toLowerCase();
  const normalizedSymbol = asset.symbol.trim().toUpperCase();
  const normalizedChainShort = selectedChainShort.trim().toUpperCase();

  if (
    (normalizedName === normalizedChainLabel || normalizedName === normalizedSymbol.toLowerCase()) &&
    normalizedSymbol === normalizedChainShort
  ) {
    return null;
  }

  if (normalizedName === normalizedSymbol.toLowerCase()) {
    return null;
  }

  if (asset.chain === 'solana' && asset.address && asset.metadataSource !== 'native') {
    return `${asset.symbol}  ${shortenAddress(asset.address)}`;
  }

  return asset.symbol;
}

function formatSwapAmountInput(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return '';
  }

  const precision = amount >= 1_000 ? 2 : amount >= 1 ? 6 : 9;
  return amount.toFixed(precision).replace(/\.?0+$/, '');
}

function isSvgUri(uri?: string) {
  return typeof uri === 'string' && uri.trim().toLowerCase().includes('.svg');
}

function dedupeVisibleWallets(wallets: MobileWallet[]) {
  const seen = new Set<string>();
  return wallets.filter((wallet) => {
    const key = `${wallet.chain}:${wallet.address.trim().toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function openOgReputationSpace(daoId: string) {
  const url = buildOgReputationSpaceUrl(daoId);
  const supported = await Linking.canOpenURL(url);
  if (supported) {
    await Linking.openURL(url);
  }
}

async function openVerificationSpace(daoId: string) {
  const url = buildVerificationSpaceUrl(daoId);
  const supported = await Linking.canOpenURL(url);
  if (supported) {
    await Linking.openURL(url);
  }
}

function normalizeDiscoverUrlInput(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      url: GRAPE_DISCOVER_DEFAULT_URL,
      error: null as string | null
    };
  }

  if (/\s/.test(trimmed)) {
    return {
      url: null as string | null,
      error: 'URLs cannot contain spaces.'
    };
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      return {
        url: null as string | null,
        error: 'Only http and https URLs are supported in Grape Discover.'
      };
    }

    if (!parsed.hostname) {
      return {
        url: null as string | null,
        error: 'Enter a valid website address.'
      };
    }

    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local');
    const isIpAddress = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(parsed.hostname);
    if (parsed.protocol === 'http:' && !isLocalhost && !isIpAddress) {
      parsed.protocol = 'https:';
    }

    return {
      url: parsed.toString(),
      error: null as string | null
    };
  } catch {
    return {
      url: null as string | null,
      error: 'Enter a valid website address.'
    };
  }
}

function normalizeScannedRecipientInput(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }

  const compact = trimmed.replace(/\s+/g, '');
  const schemeMatch = compact.match(/^([a-z0-9+.-]+):(.*)$/i);
  if (!schemeMatch) {
    return compact;
  }

  const [, scheme, remainder] = schemeMatch;
  const normalizedScheme = scheme.toLowerCase();
  if (!['solana', 'ethereum', 'evm', 'monad', 'sui'].includes(normalizedScheme)) {
    return compact;
  }

  const withoutSlashes = remainder.replace(/^\/\//, '').replace(/^\/+/, '');
  const address = withoutSlashes.split(/[/?#]/)[0]?.trim();
  return address || compact;
}

function normalizeScannedRestorePayloadInput(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('grape-link:{') || trimmed.startsWith('{')) {
    return trimmed;
  }
  if (trimmed.startsWith('grape-link:')) {
    return `grape-link:${trimmed.slice('grape-link:'.length).replace(/\s+/g, '')}`;
  }
  return trimmed.replace(/\s+/g, '');
}

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function formatShortAddress(address: string) {
  if (!address) {
    return 'Unknown';
  }
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function parseOriginFromUrl(value: string) {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return '';
  }
}

export default function App() {
  const { width } = useWindowDimensions();
  const [screen, setScreen] = useState<Screen>('loading');
  const [mainTab, setMainTab] = useState<MainTab>('home');
  const [walletState, setWalletState] = useState<MobileWalletState>(createEmptyMobileWalletState());
  const [error, setError] = useState<string | null>(null);
  const [setupMode, setSetupMode] = useState<SetupMode>('create');
  const [mnemonicLength, setMnemonicLength] = useState<WalletMnemonicLength>(12);
  const [generatedMnemonic, setGeneratedMnemonic] = useState(() => createWalletMnemonic(12));
  const [importKind, setImportKind] = useState<ImportKind>('mnemonic');
  const [passkeyRecoveryMode, setPasskeyRecoveryMode] = useState<PasskeyRecoveryMode>('passkey-only');
  const [importMnemonic, setImportMnemonic] = useState('');
  const [importPrivateKey, setImportPrivateKey] = useState('');
  const [importPrivateKeyChain, setImportPrivateKeyChain] = useState<MobileWalletState['selectedChain']>('solana');
  const [restorePayload, setRestorePayload] = useState('');
  const [restorePairingCode, setRestorePairingCode] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupPasswordConfirm, setSetupPasswordConfirm] = useState('');
  const [confirmBackedUp, setConfirmBackedUp] = useState(false);
  const [confirmPasskeyOnlyAccess, setConfirmPasskeyOnlyAccess] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [assets, setAssets] = useState<MobileAsset[]>([]);
  const [remoteActivity, setRemoteActivity] = useState<MobileActivity[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [sendRecipient, setSendRecipient] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [walletListExpanded, setWalletListExpanded] = useState(false);
  const [chainPickerVisible, setChainPickerVisible] = useState(false);
  const [sendScreenVisible, setSendScreenVisible] = useState(false);
  const [sendAssetId, setSendAssetId] = useState<string | null>(null);
  const [sendAssetPickerVisible, setSendAssetPickerVisible] = useState(false);
  const [sendAssetSearch, setSendAssetSearch] = useState('');
  const [swapScreenVisible, setSwapScreenVisible] = useState(false);
  const [swapInputAssetId, setSwapInputAssetId] = useState<string | null>(null);
  const [swapOutputAssetId, setSwapOutputAssetId] = useState<string | null>(null);
  const [swapInputPickerVisible, setSwapInputPickerVisible] = useState(false);
  const [swapOutputPickerVisible, setSwapOutputPickerVisible] = useState(false);
  const [swapAssetSearch, setSwapAssetSearch] = useState('');
  const [swapAmount, setSwapAmount] = useState('');
  const [swapQuote, setSwapQuote] = useState<MobileSwapQuote | null>(null);
  const [swapSelectedRouteId, setSwapSelectedRouteId] = useState<string | null>(null);
  const [swapQuoteLoading, setSwapQuoteLoading] = useState(false);
  const [swapExecuteLoading, setSwapExecuteLoading] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [bridgeScreenVisible, setBridgeScreenVisible] = useState(false);
  const [bridgeAmount, setBridgeAmount] = useState('');
  const [bridgeToChain, setBridgeToChain] = useState<MobileWalletState['selectedChain']>('ethereum');
  const [bridgeDestinationWalletId, setBridgeDestinationWalletId] = useState<string | null>(null);
  const [bridgeQuote, setBridgeQuote] = useState<MobileBridgeQuoteSummary | null>(null);
  const [bridgeSelectedRouteId, setBridgeSelectedRouteId] = useState<string | null>(null);
  const [bridgeQuoteLoading, setBridgeQuoteLoading] = useState(false);
  const [bridgeExecuteLoading, setBridgeExecuteLoading] = useState(false);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [walletComposerVisible, setWalletComposerVisible] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [passkeyUnavailableMessage, setPasskeyUnavailableMessage] = useState<string | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [reputation, setReputation] = useState<MobileReputationResponse>({
    spaces: [],
    totalPoints: '0',
    totalEffectivePoints: '0',
    source: 'none',
    refreshedAt: Date.now()
  });
  const [reputationLoading, setReputationLoading] = useState(false);
  const [reputationError, setReputationError] = useState<string | null>(null);
  const [reputationSpaceInput, setReputationSpaceInput] = useState('');
  const [reputationSaving, setReputationSaving] = useState(false);
  const [verificationSpaceInput, setVerificationSpaceInput] = useState('');
  const [verificationSaving, setVerificationSaving] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [governance, setGovernance] = useState<MobileGovernanceResponse>({
    trackedDaos: [],
    discoveredDaos: [],
    daos: [],
    memberDaos: 0,
    proposals: [],
    source: 'none',
    network: 'mainnet-beta',
    refreshedAt: Date.now()
  });
  const [governanceLoading, setGovernanceLoading] = useState(false);
  const [governanceError, setGovernanceError] = useState<string | null>(null);
  const [governanceDaoInput, setGovernanceDaoInput] = useState('');
  const [governanceSaving, setGovernanceSaving] = useState(false);
  const [governanceVotingProposalId, setGovernanceVotingProposalId] = useState<string | null>(null);
  const [governanceVoteError, setGovernanceVoteError] = useState<string | null>(null);
  const [governanceVoteResult, setGovernanceVoteResult] = useState<MobileGovernanceVoteResponse | null>(null);
  const [governanceShowFinalizing, setGovernanceShowFinalizing] = useState(false);
  const [governanceEligibility, setGovernanceEligibility] = useState<MobileGovernanceEligibleDao[]>([]);
  const [governanceEligibilityLoading, setGovernanceEligibilityLoading] = useState(false);
  const [governanceEligibilityError, setGovernanceEligibilityError] = useState<string | null>(null);
  const [governanceEligibilityScanned, setGovernanceEligibilityScanned] = useState(false);
  const [exportPassword, setExportPassword] = useState('');

  useEffect(() => {
    if (!PASSKEY_WALLET_CREATION_ENABLED && setupMode === 'passkey') {
      setSetupMode('create');
    }
  }, [setupMode]);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportReveal, setExportReveal] = useState(false);
  const [exportedPrivateKey, setExportedPrivateKey] = useState<string | null>(null);
  const [exportVerifiedWalletId, setExportVerifiedWalletId] = useState<string | null>(null);
  const [deviceLinkSession, setDeviceLinkSession] = useState<MobileDeviceLinkSession | null>(null);
  const [deviceLinkLoading, setDeviceLinkLoading] = useState(false);
  const [expandedSettingsSections, setExpandedSettingsSections] = useState<Set<string>>(() => new Set(['current-wallet', 'backup']));
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  const [qrScannerTarget, setQrScannerTarget] = useState<'restore' | 'send' | null>(null);
  const [discoverUrlInput, setDiscoverUrlInput] = useState(GRAPE_DISCOVER_DEFAULT_URL);
  const [discoverUrl, setDiscoverUrl] = useState(GRAPE_DISCOVER_DEFAULT_URL);
  const [discoverCurrentUrl, setDiscoverCurrentUrl] = useState(GRAPE_DISCOVER_DEFAULT_URL);
  const [discoverTitle, setDiscoverTitle] = useState('Grape Discover');
  const [discoverCanGoBack, setDiscoverCanGoBack] = useState(false);
  const [discoverCanGoForward, setDiscoverCanGoForward] = useState(false);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverLoadError, setDiscoverLoadError] = useState<string | null>(null);
  const [discoverControlsExpanded, setDiscoverControlsExpanded] = useState(false);
  const [discoverConnectedOrigins, setDiscoverConnectedOrigins] = useState<string[]>([]);
  const [discoverApproval, setDiscoverApproval] = useState<DiscoverApproval | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const discoverWebViewRef = useRef<WebView>(null);
  const parsedRestorePayload = useMemo(() => {
    if (!restorePayload.trim()) {
      return null;
    }
    try {
      return parseDeviceLinkPayloadText(restorePayload);
    } catch {
      return null;
    }
  }, [restorePayload]);

  const selectedWallet = useMemo(() => getSelectedWallet(walletState), [walletState]);
  const discoverWallet = useMemo(
    () => (selectedWallet?.chain === 'solana' ? selectedWallet : walletState.wallets.find((wallet) => wallet.chain === 'solana') ?? null),
    [selectedWallet, walletState.wallets]
  );
  const selectedChainMeta = chainMeta(walletState.selectedChain);
  const activeTheme = useMemo(
    () => getMobileTheme(walletState.selectedTheme ?? DEFAULT_THEME),
    [walletState.selectedTheme]
  );
  const styles = useMemo(() => createStyles(activeTheme), [activeTheme]);
  const backgroundAsset = THEME_BACKGROUND_ASSETS[activeTheme.id];
  const isCompact = width < 390;
  const isWide = width >= 768;
  const contentMaxWidth = isWide ? 680 : 560;
  const screenPadding = isCompact ? 10 : 12;
  const footerInset = isCompact ? 16 : 20;
  const deviceLinkQrSize = Math.max(240, Math.min(width - 120, 320));
  const paperTheme = useMemo(
    () => ({
        ...MD3DarkTheme,
        roundness: 7,
        colors: {
          ...MD3DarkTheme.colors,
          primary: activeTheme.grape,
          secondary: '#b57bff',
          background: activeTheme.bg,
          surface: activeTheme.panel,
          surfaceVariant: 'rgba(255,255,255,0.06)',
          outline: activeTheme.panelBorder,
          onSurface: activeTheme.text,
          onSurfaceVariant: activeTheme.muted,
          error: activeTheme.danger
        }
      }),
    [activeTheme]
  );
  const launchFade = useRef(new Animated.Value(0)).current;
  const launchLift = useRef(new Animated.Value(16)).current;
  const launchScale = useRef(new Animated.Value(0.92)).current;
  const launchHalo = useRef(new Animated.Value(0.35)).current;
  const screenEnterOpacity = useRef(new Animated.Value(0)).current;
  const screenEnterLift = useRef(new Animated.Value(12)).current;
  const screenEnterScale = useRef(new Animated.Value(0.98)).current;
  const refreshSpin = useRef(new Animated.Value(0)).current;
  const lockBreathScale = useRef(new Animated.Value(1)).current;
  const lockHaloPulse = useRef(new Animated.Value(0.18)).current;
  const chainWallets = useMemo(
    () => dedupeVisibleWallets(walletState.wallets.filter((wallet) => wallet.chain === walletState.selectedChain)),
    [walletState.selectedChain, walletState.wallets]
  );
  const availableChains = useMemo(
    () => chains.filter((item) => walletState.wallets.some((wallet) => wallet.chain === item.id)),
    [walletState.wallets]
  );
  const walletsByChain = useMemo(
    () =>
      chains
        .map((chain) => ({
          chain,
          wallets: dedupeVisibleWallets(walletState.wallets.filter((wallet) => wallet.chain === chain.id))
        }))
        .filter((entry) => entry.wallets.length > 0),
    [walletState.wallets]
  );
  const filteredActivity = useMemo(
    () => {
      if (!selectedWallet) {
        return [];
      }

      const local = walletState.activities.filter((activity) => activity.walletId === selectedWallet.id);
      const remote = remoteActivity.filter((activity) => activity.walletId === selectedWallet.id);
      const merged = new Map<string, MobileActivity>();

      [...remote, ...local].forEach((activity) => {
        const key = activity.signature || activity.id;
        if (!merged.has(key)) {
          merged.set(key, activity);
        }
      });

      return [...merged.values()].sort((left, right) => right.timestamp - left.timestamp);
    },
    [remoteActivity, selectedWallet, walletState.activities]
  );
  const headlineAsset = assets[0];
  const holdingsSummary = assets.length === 0 ? '--' : headlineAsset?.amountLabel ?? '--';
  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId]
  );
  const totalEffectiveReputationPoints = useMemo(
    () => formatWholeNumberString(reputation.totalEffectivePoints),
    [reputation.totalEffectivePoints]
  );
  const trackedVerificationSpaceCount = useMemo(
    () => walletState.trackedVerificationSpaceIds.length,
    [walletState.trackedVerificationSpaceIds]
  );
  const trustedDappOrigins = useMemo(
    () => new Set((walletState.trustedDappOrigins ?? []).map((origin) => origin.toLowerCase())),
    [walletState.trustedDappOrigins]
  );
  const actionableGovernanceProposalCount = useMemo(
    () => governance.proposals.filter((proposal) => proposal.canVote).length,
    [governance.proposals]
  );
  const totalGovernanceDaoCount = useMemo(
    () => new Set([...governance.discoveredDaos, ...governance.daos.map((dao) => dao.daoId), ...walletState.trackedGovernanceDaoIds]).size,
    [governance.daos, governance.discoveredDaos, walletState.trackedGovernanceDaoIds]
  );
  const participatingGovernanceDaoIds = useMemo(
    () => new Set([...governance.discoveredDaos, ...governance.daos.map((dao) => dao.daoId), ...walletState.trackedGovernanceDaoIds]),
    [governance.daos, governance.discoveredDaos, walletState.trackedGovernanceDaoIds]
  );
  const selectedSendAsset = useMemo(() => {
    if (sendAssetId) {
      return assets.find((asset) => asset.id === sendAssetId) ?? null;
    }

    return assets[0] ?? null;
  }, [assets, sendAssetId]);
  const filteredSendAssets = useMemo(() => {
    const query = sendAssetSearch.trim().toLowerCase();
    if (!query) {
      return assets;
    }

    return assets.filter((asset) => {
      const haystacks = [
        asset.name,
        asset.symbol,
        asset.address ?? '',
        asset.description ?? ''
      ];

      return haystacks.some((value) => value.toLowerCase().includes(query));
    });
  }, [assets, sendAssetSearch]);
  const swappableAssets = useMemo(
    () => (selectedWallet?.chain === 'solana' ? assets.filter((asset) => asset.chain === 'solana') : []),
    [assets, selectedWallet?.chain]
  );
  const selectedSwapInputAsset = useMemo(() => {
    if (swapInputAssetId) {
      return swappableAssets.find((asset) => asset.id === swapInputAssetId) ?? null;
    }

    return swappableAssets[0] ?? null;
  }, [swapInputAssetId, swappableAssets]);
  const swapOutputCandidates = useMemo(
    () => swappableAssets.filter((asset) => asset.id !== selectedSwapInputAsset?.id),
    [selectedSwapInputAsset?.id, swappableAssets]
  );
  const selectedSwapOutputAsset = useMemo(() => {
    if (swapOutputAssetId) {
      return swapOutputCandidates.find((asset) => asset.id === swapOutputAssetId) ?? null;
    }

    return swapOutputCandidates[0] ?? null;
  }, [swapOutputCandidates, swapOutputAssetId]);
  const filteredSwapAssets = useMemo(() => {
    const query = swapAssetSearch.trim().toLowerCase();
    if (!query) {
      return swappableAssets;
    }

    return swappableAssets.filter((asset) =>
      [asset.name, asset.symbol, asset.address ?? '', asset.description ?? ''].some((value) => value.toLowerCase().includes(query))
    );
  }, [swapAssetSearch, swappableAssets]);
  const bridgeDestinationChains = useMemo(() => {
    if (!selectedWallet || selectedWallet.chain === 'sui') {
      return [] as MobileWalletState['selectedChain'][];
    }

    return getMobileSupportedBridgeDestinations(
      selectedWallet.chain as 'solana' | 'ethereum' | 'monad'
    ) as MobileWalletState['selectedChain'][];
  }, [selectedWallet?.chain]);
  const bridgeDestinationWallets = useMemo(
    () => dedupeVisibleWallets(walletState.wallets.filter((wallet) => wallet.chain === bridgeToChain)),
    [bridgeToChain, walletState.wallets]
  );
  const selectedBridgeDestinationWallet = useMemo(() => {
    if (bridgeDestinationWalletId) {
      return bridgeDestinationWallets.find((wallet) => wallet.id === bridgeDestinationWalletId) ?? null;
    }

    return bridgeDestinationWallets[0] ?? null;
  }, [bridgeDestinationWalletId, bridgeDestinationWallets]);

  function resetSwapDraft() {
    setSwapQuote(null);
    setSwapSelectedRouteId(null);
    setSwapError(null);
  }

  function handleSwapAmountChange(value: string) {
    setSwapAmount(value);
    resetSwapDraft();
  }

  function handleFlipSwapDirection() {
    if (!selectedSwapInputAsset || !selectedSwapOutputAsset) {
      return;
    }

    setSwapInputAssetId(selectedSwapOutputAsset.id);
    setSwapOutputAssetId(selectedSwapInputAsset.id);
    resetSwapDraft();
  }

  function setSwapAmountByRatio(ratio: number) {
    const availableAmount = selectedSwapInputAsset?.amountUi ?? 0;
    if (!(availableAmount > 0)) {
      return;
    }

    setSwapAmount(formatSwapAmountInput(availableAmount * ratio));
    resetSwapDraft();
  }

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        const state = await loadMobileWalletState();
        if (!mounted) {
          return;
        }
        setWalletState(state);
        setScreen(state.setup === 'ready' ? 'locked' : 'setup');
      } catch (unknownError) {
        if (!mounted) {
          return;
        }
        setError(unknownError instanceof Error ? unknownError.message : 'Unable to load mobile wallet state.');
        setScreen('setup');
      }
    }

    void bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function checkBiometricAvailability() {
      try {
        const [hasHardware, supported, enrolled, nativePasskeyStatus] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.supportedAuthenticationTypesAsync(),
          LocalAuthentication.isEnrolledAsync(),
          getMobileDeterministicPasskeyWalletSupportStatus()
        ]);

        if (!mounted) {
          return;
        }

        setBiometricAvailable(hasHardware && enrolled && supported.length > 0);
        setPasskeyAvailable(nativePasskeyStatus.supported);
        setPasskeyUnavailableMessage(getMobileDeterministicPasskeyWalletUnavailableMessage(nativePasskeyStatus));
      } catch {
        if (mounted) {
          setBiometricAvailable(false);
          setPasskeyAvailable(false);
          setPasskeyUnavailableMessage('Unable to determine whether native passkey support is available on this device.');
        }
      }
    }

    void checkBiometricAvailability();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const settle = Animated.parallel([
      Animated.timing(launchFade, {
        toValue: 1,
        duration: 560,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(launchLift, {
        toValue: 0,
        duration: 560,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.spring(launchScale, {
        toValue: 1,
        damping: 16,
        stiffness: 160,
        mass: 0.9,
        useNativeDriver: true
      })
    ]);

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(launchHalo, {
          toValue: 0.62,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(launchHalo, {
          toValue: 0.28,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    );

    settle.start();
    pulse.start();

    return () => {
      settle.stop();
      pulse.stop();
    };
  }, [launchFade, launchHalo, launchLift, launchScale]);

  useEffect(() => {
    if (screen === 'loading') {
      return;
    }

    screenEnterOpacity.setValue(0);
    screenEnterLift.setValue(12);
    screenEnterScale.setValue(0.98);

    Animated.parallel([
      Animated.timing(screenEnterOpacity, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(screenEnterLift, {
        toValue: 0,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(screenEnterScale, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    ]).start();
  }, [screen, screenEnterLift, screenEnterOpacity, screenEnterScale]);

  useEffect(() => {
    if (!assetsLoading) {
      refreshSpin.stopAnimation();
      Animated.timing(refreshSpin, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start();
      return;
    }

    refreshSpin.setValue(0);
    const spinner = Animated.loop(
      Animated.timing(refreshSpin, {
        toValue: 1,
        duration: 880,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );

    spinner.start();

    return () => {
      spinner.stop();
    };
  }, [assetsLoading, refreshSpin]);

  useEffect(() => {
    if (screen !== 'locked') {
      lockBreathScale.stopAnimation();
      lockHaloPulse.stopAnimation();
      lockBreathScale.setValue(1);
      lockHaloPulse.setValue(0.08);
      return;
    }

    const breathLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(lockBreathScale, {
          toValue: 1.012,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(lockBreathScale, {
          toValue: 1.018,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(lockBreathScale, {
          toValue: 1.008,
          duration: 170,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(lockBreathScale, {
          toValue: 1,
          duration: 1750,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(lockHaloPulse, {
          toValue: 0.065,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(lockHaloPulse, {
          toValue: 0.085,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(lockHaloPulse, {
          toValue: 0.055,
          duration: 170,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(lockHaloPulse, {
          toValue: 0.04,
          duration: 1750,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    );

    breathLoop.start();
    pulseLoop.start();

    return () => {
      breathLoop.stop();
      pulseLoop.stop();
    };
  }, [lockBreathScale, lockHaloPulse, screen]);

  useEffect(() => {
    setGeneratedMnemonic(createWalletMnemonic(mnemonicLength));
    setConfirmBackedUp(false);
  }, [mnemonicLength]);

  useEffect(() => {
    let mounted = true;

    async function refreshWalletData() {
      if (!unlocked || !selectedWallet) {
        setAssets([]);
        setRemoteActivity([]);
        return;
      }

      setAssetsLoading(true);
      setActivityLoading(true);
      if (selectedWallet.chain === 'solana') {
        void loadWalletAssetsFast(selectedWallet)
          .then((nextAssets) => {
            if (!mounted) {
              return;
            }
            setAssets(nextAssets);
            setAssetsLoading(false);
          })
          .catch(() => {});
      }
      try {
        const [nextAssets, nextActivity] = await Promise.all([
          loadWalletAssets(selectedWallet),
          loadWalletActivity(selectedWallet).catch(() => [])
        ]);
        if (!mounted) {
          return;
        }
        setAssets(nextAssets);
        setRemoteActivity(nextActivity);
        setError(null);
      } catch (unknownError) {
        if (!mounted) {
          return;
        }
        setError(unknownError instanceof Error ? unknownError.message : 'Unable to load holdings.');
      } finally {
        if (mounted) {
          setAssetsLoading(false);
          setActivityLoading(false);
        }
      }
    }

    void refreshWalletData();
    return () => {
      mounted = false;
    };
  }, [selectedWallet, unlocked]);

  useEffect(() => {
    let mounted = true;

    async function refreshActivityForTab() {
      if (!unlocked || !selectedWallet || mainTab !== 'activity') {
        return;
      }

      setActivityLoading(true);
      try {
        const nextActivity = await loadWalletActivity(selectedWallet).catch(() => []);
        if (!mounted) {
          return;
        }

        setRemoteActivity(nextActivity);
      } finally {
        if (mounted) {
          setActivityLoading(false);
        }
      }
    }

    void refreshActivityForTab();
    return () => {
      mounted = false;
    };
  }, [mainTab, selectedWallet, unlocked]);

  useEffect(() => {
    let mounted = true;

    async function refreshWalletReputation() {
      if (!unlocked || !selectedWallet || selectedWallet.chain !== 'solana') {
        if (mounted) {
          setReputation({
            spaces: [],
            totalPoints: '0',
            totalEffectivePoints: '0',
            source: 'none',
            refreshedAt: Date.now()
          });
          setReputationError(null);
          setReputationLoading(false);
        }
        return;
      }

      if (walletState.trackedReputationSpaceIds.length === 0) {
        if (mounted) {
          setReputation({
            spaces: [],
            totalPoints: '0',
            totalEffectivePoints: '0',
            source: 'none',
            refreshedAt: Date.now()
          });
          setReputationError(null);
          setReputationLoading(false);
        }
        return;
      }

      setReputationLoading(true);
      try {
        const nextReputation = await loadWalletReputation(selectedWallet, walletState.trackedReputationSpaceIds);
        if (!mounted) {
          return;
        }
        setReputation(nextReputation);
        setReputationError(null);
      } catch (unknownError) {
        if (!mounted) {
          return;
        }
        setReputationError(unknownError instanceof Error ? unknownError.message : 'Unable to load reputation.');
      } finally {
        if (mounted) {
          setReputationLoading(false);
        }
      }
    }

    void refreshWalletReputation();
    return () => {
      mounted = false;
    };
  }, [selectedWallet, unlocked, walletState.trackedReputationSpaceIds]);

  useEffect(() => {
    let mounted = true;

    async function refreshWalletGovernance() {
      if (!unlocked || !selectedWallet || selectedWallet.chain !== 'solana') {
        if (mounted) {
          setGovernance({
            trackedDaos: walletState.trackedGovernanceDaoIds,
            discoveredDaos: [],
            daos: [],
            memberDaos: 0,
            proposals: [],
            source: 'none',
            network: 'mainnet-beta',
            refreshedAt: Date.now()
          });
          setGovernanceError(null);
          setGovernanceLoading(false);
        }
        return;
      }

      setGovernanceLoading(true);
      try {
        const nextGovernance = await loadWalletGovernance(selectedWallet, walletState.trackedGovernanceDaoIds);
        if (!mounted) {
          return;
        }
        setGovernance(nextGovernance);
        setGovernanceError(null);
      } catch (unknownError) {
        if (!mounted) {
          return;
        }
        setGovernance({
          trackedDaos: walletState.trackedGovernanceDaoIds,
          discoveredDaos: [],
          daos: [],
          memberDaos: 0,
          proposals: [],
          source: 'none',
          network: 'mainnet-beta',
          refreshedAt: Date.now()
        });
        setGovernanceError(unknownError instanceof Error ? unknownError.message : 'Unable to load governance proposals.');
      } finally {
        if (mounted) {
          setGovernanceLoading(false);
        }
      }
    }

    void refreshWalletGovernance();
    return () => {
      mounted = false;
    };
  }, [selectedWallet, unlocked, walletState.trackedGovernanceDaoIds]);

  useEffect(() => {
    setSelectedAssetId(null);
  }, [selectedWallet?.id, walletState.selectedChain]);

  useEffect(() => {
    setSendRecipient('');
    setSendAmount('');
    setSendAssetId(null);
    setSendScreenVisible(false);
    setSendAssetPickerVisible(false);
    setSendAssetSearch('');
  }, [selectedWallet?.id, walletState.selectedChain]);

  useEffect(() => {
    setSwapAmount('');
    setSwapQuote(null);
    setSwapSelectedRouteId(null);
    setSwapInputAssetId(null);
    setSwapOutputAssetId(null);
    setSwapAssetSearch('');
    setSwapInputPickerVisible(false);
    setSwapOutputPickerVisible(false);
    setSwapScreenVisible(false);
    setSwapError(null);
  }, [selectedWallet?.id, walletState.selectedChain]);

  useEffect(() => {
    const nextToChain = bridgeDestinationChains[0] ?? 'ethereum';
    setBridgeAmount('');
    setBridgeToChain(nextToChain);
    setBridgeDestinationWalletId(null);
    setBridgeQuote(null);
    setBridgeSelectedRouteId(null);
    setBridgeScreenVisible(false);
    setBridgeError(null);
  }, [bridgeDestinationChains, selectedWallet?.id, walletState.selectedChain]);

  useEffect(() => {
    if (!bridgeDestinationWallets.some((wallet) => wallet.id === bridgeDestinationWalletId)) {
      setBridgeDestinationWalletId(bridgeDestinationWallets[0]?.id ?? null);
    }
  }, [bridgeDestinationWalletId, bridgeDestinationWallets]);

  useEffect(() => {
    setExportPassword('');
    setExportLoading(false);
    setExportReveal(false);
    setExportedPrivateKey(null);
    setExportVerifiedWalletId(null);
    setDeviceLinkSession(null);
    setDiscoverConnectedOrigins([]);
    setDiscoverApproval(null);
    setGovernanceEligibility([]);
    setGovernanceEligibilityLoading(false);
    setGovernanceEligibilityError(null);
    setGovernanceEligibilityScanned(false);
  }, [selectedWallet?.id]);

  async function deriveCurrentPasskeyWalletPassword() {
    if (!walletState.passkeyWallet) {
      throw new Error('This mobile wallet set is not backed by a deterministic passkey.');
    }

    return getMobileDeterministicPasskeyWalletPassword(walletState.passkeyWallet);
  }

  async function saveState(nextState: MobileWalletState) {
    setWalletState(nextState);
    await persistMobileWalletState(nextState);
  }

  function sendDiscoverProviderResponse(response: {
    id: string;
    success: boolean;
    result?: unknown;
    error?: {
      code: string;
      message: string;
    };
  }) {
    const payload = JSON.stringify(response);
    discoverWebViewRef.current?.injectJavaScript(
      `window.__grapeDiscoverBridge && window.__grapeDiscoverBridge.handleNativeResponse(${payload}); true;`
    );
  }

  async function rememberTrustedDappOrigin(origin: string) {
    const normalizedOrigin = origin.trim().toLowerCase();
    if (!normalizedOrigin || trustedDappOrigins.has(normalizedOrigin)) {
      return;
    }

    await saveState({
      ...walletState,
      trustedDappOrigins: [...walletState.trustedDappOrigins, normalizedOrigin]
    });
  }

  async function forgetTrustedDappOrigin(origin: string) {
    const normalizedOrigin = origin.trim().toLowerCase();
    setDiscoverConnectedOrigins((currentValue) => currentValue.filter((entry) => entry !== normalizedOrigin));
    await saveState({
      ...walletState,
      trustedDappOrigins: walletState.trustedDappOrigins.filter((entry) => entry !== normalizedOrigin)
    });
  }

  function handleDiscoverNavigate(rawInput?: string) {
    const normalized = normalizeDiscoverUrlInput(rawInput ?? discoverUrlInput);
    if (!normalized.url) {
      setDiscoverLoadError(normalized.error);
      return;
    }

    const nextUrl = normalized.url;
    setDiscoverUrlInput(nextUrl);
    setDiscoverUrl(nextUrl);
    setDiscoverCurrentUrl(nextUrl);
    setDiscoverLoadError(null);
    setMainTab('discover');
    setError(null);
  }

  function handleDiscoverNavigationStateChange(nextState: WebViewNavigation) {
    if (typeof nextState.url === 'string' && nextState.url.trim()) {
      setDiscoverCurrentUrl(nextState.url);
      setDiscoverUrlInput(nextState.url);
      setDiscoverLoadError(null);
    }
    setDiscoverCanGoBack(nextState.canGoBack);
    setDiscoverCanGoForward(nextState.canGoForward);
    setDiscoverLoading(nextState.loading);
    setDiscoverTitle(nextState.title?.trim() ? nextState.title : 'Grape Discover');
  }

  function handleDiscoverShouldStart(requestUrl: string) {
    if (!requestUrl || typeof requestUrl !== 'string') {
      return false;
    }

    if (/^(https?:|about:blank|data:|blob:|javascript:)/i.test(requestUrl)) {
      return true;
    }

    if (/^[a-z][a-z0-9+.-]*:/i.test(requestUrl)) {
      void Linking.openURL(requestUrl).catch(() => undefined);
      return false;
    }

    return true;
  }

  function isDiscoverOriginAuthorized(origin: string) {
    return trustedDappOrigins.has(origin) || discoverConnectedOrigins.includes(origin);
  }

  function rejectDiscoverProviderRequest(request: DiscoverProviderRequest, code: string, message: string) {
    sendDiscoverProviderResponse({
      id: request.id,
      success: false,
      error: { code, message }
    });
  }

  function handleDiscoverProviderMessage(event: WebViewMessageEvent) {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        id?: string;
        method?: DiscoverProviderRequest['method'];
        params?: Record<string, unknown>;
        origin?: DiscoverProviderRequest['origin'];
      };

      if (payload.type !== 'grape-provider-request' || !payload.id || !payload.method) {
        return;
      }

      const request: DiscoverProviderRequest = {
        id: payload.id,
        method: payload.method,
        params: payload.params,
        origin: payload.origin
      };
      const requestOrigin = parseOriginFromUrl(request.origin?.origin || request.origin?.href || discoverCurrentUrl);
      const originHost = requestOrigin ? new URL(requestOrigin).host : 'unknown';

      if (!requestOrigin) {
        rejectDiscoverProviderRequest(request, 'BAD_ORIGIN', 'This page does not have a valid origin.');
        return;
      }

      if (!discoverWallet) {
        rejectDiscoverProviderRequest(request, 'NO_SOLANA_WALLET', 'Add or select a Solana wallet to use Grape Discover.');
        return;
      }

      if (request.method === 'disconnect') {
        setDiscoverConnectedOrigins((currentValue) => currentValue.filter((entry) => entry !== requestOrigin));
        sendDiscoverProviderResponse({
          id: request.id,
          success: true,
          result: {}
        });
        return;
      }

      if (request.method === 'connect') {
        const silent = Boolean(request.params?.silent);
        if (silent && !trustedDappOrigins.has(requestOrigin)) {
          rejectDiscoverProviderRequest(request, 'UNTRUSTED', 'This site is not trusted yet.');
          return;
        }

        if (trustedDappOrigins.has(requestOrigin)) {
          setDiscoverConnectedOrigins((currentValue) => (currentValue.includes(requestOrigin) ? currentValue : [...currentValue, requestOrigin]));
          sendDiscoverProviderResponse({
            id: request.id,
            success: true,
            result: { publicKey: discoverWallet.address }
          });
          return;
        }
      } else if (!isDiscoverOriginAuthorized(requestOrigin)) {
        rejectDiscoverProviderRequest(request, 'NOT_CONNECTED', 'Connect this site to Grape before requesting signatures.');
        return;
      }

      setDiscoverApproval({
        request,
        origin: requestOrigin,
        originHost,
        rememberOrigin: request.method === 'connect'
      });
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to handle Grape Discover request.');
    }
  }

  async function handleApproveDiscoverRequest() {
    if (!discoverApproval || !discoverWallet) {
      return;
    }

    const { request, origin, rememberOrigin } = discoverApproval;
    setDiscoverApproval(null);
    setSubmitLoading(true);
    setError(null);

    try {
      if (request.method === 'connect') {
        if (rememberOrigin) {
          await rememberTrustedDappOrigin(origin);
        }
        setDiscoverConnectedOrigins((currentValue) => (currentValue.includes(origin) ? currentValue : [...currentValue, origin]));
        sendDiscoverProviderResponse({
          id: request.id,
          success: true,
          result: { publicKey: discoverWallet.address }
        });
        return;
      }

      if (request.method === 'signMessage') {
        const message = typeof request.params?.message === 'string' ? request.params.message : '';
        const result = await signMobileSolanaProviderMessage({
          state: walletState,
          wallet: discoverWallet,
          message
        });
        sendDiscoverProviderResponse({ id: request.id, success: true, result });
        return;
      }

      if (request.method === 'signTransaction') {
        const transaction = typeof request.params?.transaction === 'string' ? request.params.transaction : '';
        const result = await signMobileSolanaProviderTransaction({
          state: walletState,
          wallet: discoverWallet,
          transaction
        });
        sendDiscoverProviderResponse({ id: request.id, success: true, result });
        return;
      }

      if (request.method === 'signAllTransactions') {
        const transactions = Array.isArray(request.params?.transactions)
          ? request.params.transactions.filter((entry): entry is string => typeof entry === 'string')
          : [];
        const result = await signMobileSolanaProviderTransactions({
          state: walletState,
          wallet: discoverWallet,
          transactions
        });
        sendDiscoverProviderResponse({ id: request.id, success: true, result });
        return;
      }

      if (request.method === 'signAndSendTransaction' || request.method === 'sendTransaction') {
        const transaction = typeof request.params?.transaction === 'string' ? request.params.transaction : '';
        const result = await signAndSendMobileSolanaProviderTransaction({
          state: walletState,
          wallet: discoverWallet,
          transaction
        });
        sendDiscoverProviderResponse({
          id: request.id,
          success: true,
          result: request.method === 'sendTransaction' ? result.signature : result
        });
        return;
      }

      rejectDiscoverProviderRequest(request, 'UNSUPPORTED', `Unsupported request method: ${request.method}`);
    } catch (unknownError) {
      rejectDiscoverProviderRequest(
        request,
        'REQUEST_FAILED',
        unknownError instanceof Error ? unknownError.message : 'Unable to approve this request.'
      );
    } finally {
      setSubmitLoading(false);
    }
  }

  function handleRejectDiscoverRequest() {
    if (!discoverApproval) {
      return;
    }

    rejectDiscoverProviderRequest(discoverApproval.request, 'USER_REJECTED', 'The request was rejected.');
    setDiscoverApproval(null);
  }

  async function handleCreateWallet() {
    if (!confirmBackedUp) {
      setError('Confirm that you backed up the recovery phrase.');
      return;
    }
    if (setupPassword.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }
    if (setupPassword !== setupPasswordConfirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitLoading(true);
    setSubmitStatus('Creating your wallet…');
    try {
      await waitForNextFrame();
      const nextState = await createWalletSet({
        mnemonic: generatedMnemonic,
        password: setupPassword,
        source: 'created'
      });
      setWalletState(nextState);
      setUnlocked(true);
      setScreen('ready');
      setMainTab('home');
      setError(null);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to create wallet.');
    } finally {
      setSubmitStatus(null);
      setSubmitLoading(false);
    }
  }

  async function handleCreatePasskeyWallet() {
    if (!PASSKEY_WALLET_CREATION_ENABLED) {
      setError('Passkey wallet creation is temporarily hidden in this build.');
      return;
    }
    if (!passkeyAvailable) {
      setError(passkeyUnavailableMessage ?? 'Native passkey wallet support is not available on this device.');
      return;
    }
    if (passkeyRecoveryMode !== 'passkey-only') {
      setError('Deterministic passkey wallets currently support passkey-only recovery only.');
      return;
    }
    if (passkeyRecoveryMode === 'passkey-only' && !confirmPasskeyOnlyAccess) {
      setError('Confirm that you understand passkey-only access has no recovery fallback.');
      return;
    }

    setSubmitLoading(true);
    setBiometricLoading(true);
    setSubmitStatus('Creating your passkey wallet…');
    try {
      await waitForNextFrame();
      const passkeySetup = await createMobileDeterministicPasskeyWalletSetup();
      const nextState = await createWalletSet({
        mnemonic: entropyToWalletMnemonic(passkeySetup.mnemonicEntropy),
        password: passkeySetup.vaultPassword,
        source: 'created',
        passkeyWallet: passkeySetup.config
      });
      setWalletState(nextState);
      setUnlocked(true);
      setScreen('ready');
      setMainTab('home');
      setError(null);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to create passkey wallet.');
    } finally {
      setSubmitStatus(null);
      setBiometricLoading(false);
      setSubmitLoading(false);
    }
  }

  async function handleImportWallet() {
    if (importKind === 'restore' && !restorePayload.trim()) {
      setError('Restore payload is required.');
      return;
    }
    if (importKind === 'restore' && !parsedRestorePayload) {
      setError('Scan or paste a valid Grape restore payload.');
      return;
    }
    if (importKind === 'restore' && !restorePairingCode.trim()) {
      setError('Pairing code is required.');
      return;
    }
    if (setupPassword.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }
    if (setupPassword !== setupPasswordConfirm) {
      setError('Passwords do not match.');
      return;
    }

    let completed = false;
    setSubmitLoading(true);
    setSubmitStatus(importKind === 'restore' ? 'Decrypting restore payload…' : 'Importing your wallet…');
    try {
      await waitForNextFrame();
      const nextState =
        importKind === 'restore'
          ? await importMobileDeviceLink({
              state: walletState,
              payload: restorePayload.trim(),
              pairingCode: restorePairingCode.trim(),
              password: setupPassword
            })
          : importKind === 'mnemonic'
          ? await createWalletSet({
              mnemonic: importMnemonic.trim(),
              password: setupPassword,
              source: 'imported-mnemonic'
            })
          : await createPrivateKeyWallet({
              chain: importPrivateKeyChain,
              privateKey: importPrivateKey.trim(),
              password: setupPassword
            });
      completed = true;
      setSubmitStatus(null);
      setSubmitLoading(false);
      startTransition(() => {
        setWalletState(nextState);
        setUnlocked(true);
        setScreen('ready');
        setMainTab('home');
        setRestorePayload('');
        setRestorePairingCode('');
        setError(null);
      });
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to import wallet.');
    } finally {
      if (!completed) {
        setSubmitStatus(null);
        setSubmitLoading(false);
      }
    }
  }

  async function handleAddWallet() {
    if (setupMode === 'create' && !confirmBackedUp) {
      setError('Confirm that you backed up the recovery phrase.');
      return;
    }

    if (setupMode === 'passkey' && !passkeyAvailable) {
      setError(passkeyUnavailableMessage ?? 'Native passkey wallet support is not available on this device.');
      return;
    }

    if (setupMode === 'passkey') {
      setError('Passkey wallet creation is temporarily hidden in this build.');
      return;
    }

    if (setupMode === 'import' && importKind === 'mnemonic' && !isValidMnemonic(importMnemonic)) {
      setError('Recovery phrase is invalid.');
      return;
    }

    if (setupMode === 'import' && importKind === 'restore' && !restorePayload.trim()) {
      setError('Restore payload is required.');
      return;
    }

    if (setupMode === 'import' && importKind === 'restore' && !parsedRestorePayload) {
      setError('Scan or paste a valid Grape restore payload.');
      return;
    }

    if (setupMode === 'import' && importKind === 'restore' && !restorePairingCode.trim()) {
      setError('Pairing code is required.');
      return;
    }

    if (setupMode === 'import' && importKind === 'private-key' && !importPrivateKey.trim()) {
      setError('Private key is required.');
      return;
    }

    let completed = false;
    setSubmitLoading(true);
    setSubmitStatus(setupMode === 'create'
      ? 'Creating your wallet…'
      : setupMode === 'passkey'
        ? 'Creating your passkey wallet…'
        : importKind === 'restore'
          ? 'Decrypting restore payload…'
          : 'Importing your wallet…');
    try {
      await waitForNextFrame();
      let nextState: MobileWalletState;
      if (setupMode === 'create') {
        nextState = await addWalletSet({
          state: walletState,
          mnemonic: generatedMnemonic,
          source: 'created'
        });
      } else if (importKind === 'restore') {
        nextState = await importMobileDeviceLink({
          state: walletState,
          payload: restorePayload.trim(),
          pairingCode: restorePairingCode.trim()
        });
      } else if (importKind === 'mnemonic') {
        nextState = await addWalletSet({
          state: walletState,
          mnemonic: importMnemonic.trim(),
          source: 'imported-mnemonic'
        });
      } else {
        nextState = await addPrivateKeyWallet({
          state: walletState,
          chain: importPrivateKeyChain,
          privateKey: importPrivateKey.trim()
        });
      }

      completed = true;
      setSubmitStatus(null);
      setSubmitLoading(false);
      startTransition(() => {
        setWalletState(nextState);
        setWalletListExpanded(true);
        setWalletComposerVisible(false);
        setImportMnemonic('');
        setImportPrivateKey('');
        setRestorePayload('');
        setRestorePairingCode('');
        setConfirmBackedUp(false);
        setConfirmPasskeyOnlyAccess(false);
        setPasskeyRecoveryMode('passkey-only');
        setGeneratedMnemonic(createWalletMnemonic(mnemonicLength));
        setError(null);
      });
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to add wallet.');
    } finally {
      if (!completed) {
        setSubmitStatus(null);
        setSubmitLoading(false);
      }
    }
  }

  async function handleUnlock() {
    if (walletState.passkeyWallet) {
      await handlePasskeyUnlock();
      return;
    }

    if (!walletState.passwordHash) {
      setScreen('setup');
      return;
    }

    setSubmitLoading(true);
    try {
      const valid = await unlockMobileWalletState(walletState, unlockPassword);
      if (!valid) {
        setError('Password is incorrect.');
        return;
      }

      setUnlocked(true);
      setScreen('ready');
      setUnlockPassword('');
      setError(null);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to unlock wallet.');
    } finally {
      setSubmitLoading(false);
    }
  }

  async function handlePasskeyUnlock() {
    if (!walletState.passkeyWallet || submitLoading || biometricLoading) {
      return;
    }

    setError(null);
    setBiometricLoading(true);

    try {
      const password = await deriveCurrentPasskeyWalletPassword();
      const valid = await unlockMobileWalletState(walletState, password);
      if (!valid) {
        throw new Error('The passkey-derived wallet secret did not match this local wallet state.');
      }

      setUnlocked(true);
      setUnlockPassword('');
      setScreen('ready');
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to unlock wallet with passkey.');
    } finally {
      setBiometricLoading(false);
    }
  }

  async function handleSelectChain(chain: MobileWalletState['selectedChain']) {
    const nextState = {
      ...walletState,
      selectedChain: chain
    };
    await saveState(nextState);
    setChainPickerVisible(false);
    setWalletListExpanded(false);
    setSendScreenVisible(false);
    setSwapScreenVisible(false);
    setBridgeScreenVisible(false);
    setMainTab('home');
  }

  async function handleSelectWallet(walletId: string, chain = walletState.selectedChain) {
    const nextState = {
      ...walletState,
      selectedChain: chain,
      selectedWalletIds: {
        ...walletState.selectedWalletIds,
        [chain]: walletId
      }
    };
    await saveState(nextState);
    setChainPickerVisible(false);
    setWalletListExpanded(false);
    setSendScreenVisible(false);
    setSwapScreenVisible(false);
    setBridgeScreenVisible(false);
  }

  async function handleRefreshAssets() {
    if (!selectedWallet) {
      return;
    }

    setAssetsLoading(true);
    setActivityLoading(true);
    setGovernanceLoading(selectedWallet.chain === 'solana');
    if (selectedWallet.chain === 'solana') {
      void loadWalletAssetsFast(selectedWallet)
        .then((nextAssets) => {
          setAssets(nextAssets);
          setAssetsLoading(false);
        })
        .catch(() => {});
    }
    try {
      const [nextAssets, nextActivity, nextReputation, nextGovernance] = await Promise.all([
        loadWalletAssets(selectedWallet),
        loadWalletActivity(selectedWallet).catch(() => []),
        selectedWallet.chain === 'solana'
          ? loadWalletReputation(selectedWallet, walletState.trackedReputationSpaceIds).catch(() => ({
              spaces: [],
              totalPoints: '0',
              totalEffectivePoints: '0',
              source: 'none' as const,
              refreshedAt: Date.now()
            }))
          : Promise.resolve({
              spaces: [],
              totalPoints: '0',
              totalEffectivePoints: '0',
              source: 'none' as const,
              refreshedAt: Date.now()
            }),
        selectedWallet.chain === 'solana'
          ? loadWalletGovernance(selectedWallet, walletState.trackedGovernanceDaoIds).catch(() => ({
              trackedDaos: walletState.trackedGovernanceDaoIds,
              discoveredDaos: [],
              daos: [],
              memberDaos: 0,
              proposals: [],
              source: 'none' as const,
              network: 'mainnet-beta' as const,
              refreshedAt: Date.now()
            }))
          : Promise.resolve({
              trackedDaos: walletState.trackedGovernanceDaoIds,
              discoveredDaos: [],
              daos: [],
              memberDaos: 0,
              proposals: [],
              source: 'none' as const,
              network: 'mainnet-beta' as const,
              refreshedAt: Date.now()
            })
      ]);
      setAssets(nextAssets);
      setRemoteActivity(nextActivity);
      setReputation(nextReputation);
      setGovernance(nextGovernance);
      setReputationError(null);
      setGovernanceError(null);
      setError(null);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to refresh holdings.');
    } finally {
      setAssetsLoading(false);
      setActivityLoading(false);
      setGovernanceLoading(false);
    }
  }

  async function handleSend() {
    if (!selectedWallet || !selectedSendAsset) {
      return;
    }
    if (!sendRecipient.trim() || !sendAmount.trim()) {
      setError('Enter a recipient and amount.');
      return;
    }

    setSendLoading(true);
    try {
      const signature = await sendWalletAsset({
        wallet: selectedWallet,
        asset: selectedSendAsset,
        recipient: sendRecipient.trim(),
        amount: sendAmount.trim()
      });

      const activity = createSendActivity({
        wallet: selectedWallet,
        asset: selectedSendAsset,
        recipient: sendRecipient.trim(),
        amountLabel: `${sendAmount.trim()} ${selectedSendAsset.symbol}`,
        signature
      });
      const nextState = {
        ...walletState,
        activities: [activity, ...walletState.activities].slice(0, 100)
      };

      await saveState(nextState);
      setSendRecipient('');
      setSendAmount('');
      setSendAssetId(null);
      setSendScreenVisible(false);
      setError(null);
      Alert.alert('Sent', `Transaction submitted.\n\n${signature}`);
      const nextAssets = await loadWalletAssets(selectedWallet);
      setAssets(nextAssets);
      setMainTab('activity');
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to send asset.');
    } finally {
      setSendLoading(false);
    }
  }

  async function handleGetSwapQuote() {
    if (!selectedWallet || !selectedSwapInputAsset || !selectedSwapOutputAsset) {
      setSwapError('Choose both swap assets first.');
      return;
    }
    if (!swapAmount.trim()) {
      setSwapError('Enter an amount to swap.');
      return;
    }

    setSwapQuoteLoading(true);
    setSwapError(null);
    try {
      const nextQuote = await getWalletSwapQuote({
        wallet: selectedWallet,
        inputAsset: selectedSwapInputAsset,
        outputAsset: selectedSwapOutputAsset,
        amount: swapAmount.trim(),
        slippageBps: MOBILE_SWAP_SLIPPAGE_BPS
      });
      setSwapQuote(nextQuote);
      setSwapSelectedRouteId(nextQuote.selectedRouteId);
    } catch (unknownError) {
      setSwapQuote(null);
      setSwapSelectedRouteId(null);
      setSwapError(unknownError instanceof Error ? unknownError.message : 'Unable to fetch a swap quote.');
    } finally {
      setSwapQuoteLoading(false);
    }
  }

  async function handleExecuteSwap() {
    if (!selectedWallet || !selectedSwapInputAsset || !selectedSwapOutputAsset || !swapQuote) {
      return;
    }

    const activeRoute = swapQuote.routes.find((route) => route.id === swapSelectedRouteId) ?? swapQuote.routes[0];
    if (!activeRoute) {
      setSwapError('Choose a route before swapping.');
      return;
    }

    setSwapExecuteLoading(true);
    setSwapError(null);
    try {
      const result = await executeWalletSwap({
        wallet: selectedWallet,
        quoteResponse: activeRoute.quoteResponse
      });
      const activity = createSwapActivity({
        wallet: selectedWallet,
        inputAsset: selectedSwapInputAsset,
        outputAsset: selectedSwapOutputAsset,
        inputAmountLabel: `${result.inputAmountUi} ${selectedSwapInputAsset.symbol}`,
        outputAmountLabel: `${result.outputAmountUi} ${selectedSwapOutputAsset.symbol}`,
        signature: result.signature
      });
      const nextState = {
        ...walletState,
        activities: [activity, ...walletState.activities].slice(0, 100)
      };

      await saveState(nextState);
      setSwapAmount('');
      setSwapQuote(null);
      setSwapSelectedRouteId(null);
      setSwapScreenVisible(false);
      Alert.alert('Swap submitted', `${result.inputAmountUi} ${selectedSwapInputAsset.symbol} -> ${result.outputAmountUi} ${selectedSwapOutputAsset.symbol}`);
      const [nextAssets, nextActivity] = await Promise.all([
        loadWalletAssets(selectedWallet),
        loadWalletActivity(selectedWallet).catch(() => [])
      ]);
      setAssets(nextAssets);
      setRemoteActivity(nextActivity);
      setMainTab('activity');
    } catch (unknownError) {
      setSwapError(unknownError instanceof Error ? unknownError.message : 'Unable to execute the swap.');
    } finally {
      setSwapExecuteLoading(false);
    }
  }

  async function handleGetBridgeQuote() {
    if (!selectedWallet || !selectedBridgeDestinationWallet) {
      setBridgeError('Choose a destination wallet first.');
      return;
    }
    if (!bridgeAmount.trim()) {
      setBridgeError('Enter an amount to bridge.');
      return;
    }

    setBridgeQuoteLoading(true);
    setBridgeError(null);
    try {
      const nextQuote = await getWalletBridgeQuote({
        state: walletState,
        wallet: selectedWallet,
        amount: bridgeAmount.trim(),
        toChain: bridgeToChain,
        destinationWalletId: selectedBridgeDestinationWallet.id
      });
      setBridgeQuote(nextQuote);
      setBridgeSelectedRouteId(nextQuote.selectedRouteId);
    } catch (unknownError) {
      setBridgeQuote(null);
      setBridgeSelectedRouteId(null);
      setBridgeError(unknownError instanceof Error ? unknownError.message : 'Unable to fetch a bridge quote.');
    } finally {
      setBridgeQuoteLoading(false);
    }
  }

  async function handleExecuteBridge() {
    if (!selectedWallet || !selectedBridgeDestinationWallet || !bridgeQuote) {
      return;
    }

    const activeRoute = bridgeQuote.routes.find((route) => route.id === bridgeSelectedRouteId) ?? bridgeQuote.routes[0];
    if (!activeRoute) {
      setBridgeError('Choose a route before bridging.');
      return;
    }

    setBridgeExecuteLoading(true);
    setBridgeError(null);
    try {
      const result = await executeWalletBridge({
        state: walletState,
        wallet: selectedWallet,
        quoteResponse: activeRoute.quoteResponse,
        toChain: bridgeToChain,
        destinationWalletId: selectedBridgeDestinationWallet.id
      });
      const activity = createBridgeActivity({
        wallet: selectedWallet,
        destinationWallet: selectedBridgeDestinationWallet,
        fromAmountLabel: `${result.fromAmountUi} ${result.fromSymbol}`,
        toAmountLabel: `${result.toAmountUi} ${result.toSymbol}`,
        signature: result.signature
      });
      const nextState = {
        ...walletState,
        activities: [activity, ...walletState.activities].slice(0, 100)
      };

      await saveState(nextState);
      setBridgeAmount('');
      setBridgeQuote(null);
      setBridgeSelectedRouteId(null);
      setBridgeScreenVisible(false);
      Alert.alert('Bridge submitted', `${result.fromAmountUi} ${result.fromSymbol} -> ${result.toAmountUi} ${result.toSymbol}`);
      const [nextAssets, nextActivity] = await Promise.all([
        loadWalletAssets(selectedWallet),
        loadWalletActivity(selectedWallet).catch(() => [])
      ]);
      setAssets(nextAssets);
      setRemoteActivity(nextActivity);
      setMainTab('activity');
    } catch (unknownError) {
      setBridgeError(unknownError instanceof Error ? unknownError.message : 'Unable to execute the bridge.');
    } finally {
      setBridgeExecuteLoading(false);
    }
  }

  async function handleShareAddress() {
    if (!selectedWallet) {
      return;
    }

    await Share.share({
      title: `${selectedWallet.name} address`,
      message: `${selectedWallet.name}\n${selectedWallet.address}`
    });
  }

  async function handleSetPrivacyMode(value: boolean) {
    await saveState({
      ...walletState,
      privacyMode: value
    });
  }

  async function handleSetBiometricEnabled(value: boolean) {
    const nextState: MobileWalletState = {
      ...walletState,
      biometricEnabled: value
    };
    setWalletState(nextState);
    await persistMobileWalletState(nextState);
  }

  async function handleSetTheme(theme: GrapeTheme) {
    if (theme === walletState.selectedTheme) {
      return;
    }

    await saveState({
      ...walletState,
      selectedTheme: theme
    });
  }

  async function handleAddReputationSpace() {
    const daoId = reputationSpaceInput.trim();
    if (!daoId) {
      return;
    }

    setReputationSaving(true);
    try {
      const nextState = await updateTrackedReputationSpaces({
        state: walletState,
        daoIds: [...walletState.trackedReputationSpaceIds, daoId]
      });
      setWalletState(nextState);
      setReputationSpaceInput('');
      setReputationError(null);
    } catch (unknownError) {
      setReputationError(unknownError instanceof Error ? unknownError.message : 'Unable to add reputation space.');
    } finally {
      setReputationSaving(false);
    }
  }

  async function handleRemoveReputationSpace(daoId: string) {
    setReputationSaving(true);
    try {
      const nextState = await updateTrackedReputationSpaces({
        state: walletState,
        daoIds: walletState.trackedReputationSpaceIds.filter((entry) => entry !== daoId)
      });
      setWalletState(nextState);
      setReputationError(null);
    } catch (unknownError) {
      setReputationError(unknownError instanceof Error ? unknownError.message : 'Unable to remove reputation space.');
    } finally {
      setReputationSaving(false);
    }
  }

  async function handleAddVerificationSpace() {
    const daoId = verificationSpaceInput.trim();
    if (!daoId) {
      return;
    }
    if (walletState.trackedVerificationSpaceIds.includes(daoId)) {
      setVerificationError('That verification space is already tracked.');
      return;
    }

    setVerificationSaving(true);
    try {
      const nextState = await updateTrackedVerificationSpaces({
        state: walletState,
        daoIds: [...walletState.trackedVerificationSpaceIds, daoId]
      });
      setWalletState(nextState);
      setVerificationSpaceInput('');
      setVerificationError(null);
    } catch (unknownError) {
      setVerificationError(unknownError instanceof Error ? unknownError.message : 'Unable to add verification space.');
    } finally {
      setVerificationSaving(false);
    }
  }

  async function handleRemoveVerificationSpace(daoId: string) {
    setVerificationSaving(true);
    try {
      const nextState = await updateTrackedVerificationSpaces({
        state: walletState,
        daoIds: walletState.trackedVerificationSpaceIds.filter((entry) => entry !== daoId)
      });
      setWalletState(nextState);
      setVerificationError(null);
    } catch (unknownError) {
      setVerificationError(unknownError instanceof Error ? unknownError.message : 'Unable to remove verification space.');
    } finally {
      setVerificationSaving(false);
    }
  }

  async function handleScanGovernanceEligibility() {
    if (!selectedWallet || selectedWallet.chain !== 'solana') {
      setGovernanceEligibility([]);
      setGovernanceEligibilityError('DAO eligibility scanning is available for Solana wallets only.');
      return;
    }

    setGovernanceEligibilityLoading(true);
    setGovernanceEligibilityError(null);
    setGovernanceEligibilityScanned(true);
    try {
      const nextEligibility = await scanMobileGovernanceDaoEligibility(
        assets
          .filter((asset) => asset.chain === 'solana' && (asset.amountUi ?? 0) > 0)
          .map((asset) => ({
            mint: (asset.address ?? asset.id).trim(),
            amountUi: asset.amountUi ?? 0,
            amountLabel: asset.amountLabel,
            symbol: asset.symbol,
            name: asset.name,
            logoUri: asset.logoUri
          }))
      );
      setGovernanceEligibility(nextEligibility);
    } catch (unknownError) {
      setGovernanceEligibilityError(
        unknownError instanceof Error ? unknownError.message : 'Unable to scan this wallet for eligible governance DAOs.'
      );
    } finally {
      setGovernanceEligibilityLoading(false);
    }
  }

  async function handleTrackGovernanceDaoDirect(daoId: string) {
    if (walletState.trackedGovernanceDaoIds.includes(daoId) || governance.discoveredDaos.includes(daoId)) {
      return;
    }

    setGovernanceSaving(true);
    try {
      const nextState = await updateTrackedGovernanceDaos({
        state: walletState,
        daoIds: [...walletState.trackedGovernanceDaoIds, daoId]
      });
      setWalletState(nextState);
      setGovernanceError(null);
    } catch (unknownError) {
      setGovernanceError(unknownError instanceof Error ? unknownError.message : 'Unable to track governance DAO.');
    } finally {
      setGovernanceSaving(false);
    }
  }

  function openGovernanceDaoInDiscover(daoId: string) {
    setDiscoverControlsExpanded(false);
    handleDiscoverNavigate(`https://www.governance.so/dao/${daoId}`);
  }

  async function handleAddGovernanceDao() {
    const daoId = governanceDaoInput.trim();
    if (!daoId) {
      return;
    }
    if (walletState.trackedGovernanceDaoIds.includes(daoId)) {
      setGovernanceError('That governance DAO is already tracked.');
      return;
    }
    if (governance.discoveredDaos.includes(daoId)) {
      setGovernanceError('That governance DAO is already auto-detected for this wallet.');
      return;
    }

    setGovernanceSaving(true);
    try {
      const nextState = await updateTrackedGovernanceDaos({
        state: walletState,
        daoIds: [...walletState.trackedGovernanceDaoIds, daoId]
      });
      setWalletState(nextState);
      setGovernanceDaoInput('');
      setGovernanceError(null);
    } catch (unknownError) {
      setGovernanceError(unknownError instanceof Error ? unknownError.message : 'Unable to add governance DAO.');
    } finally {
      setGovernanceSaving(false);
    }
  }

  async function handleRemoveGovernanceDao(daoId: string) {
    setGovernanceSaving(true);
    try {
      const nextState = await updateTrackedGovernanceDaos({
        state: walletState,
        daoIds: walletState.trackedGovernanceDaoIds.filter((entry) => entry !== daoId)
      });
      setWalletState(nextState);
      setGovernanceError(null);
    } catch (unknownError) {
      setGovernanceError(unknownError instanceof Error ? unknownError.message : 'Unable to remove governance DAO.');
    } finally {
      setGovernanceSaving(false);
    }
  }

  async function handleGovernanceVote(input: {
    daoId: string;
    governanceId: string;
    proposalId: string;
    proposalOwnerRecordId: string;
    tokenOwnerRecordId: string | null;
    governingTokenMint: string;
    voteKind: 'approve' | 'deny' | 'abstain';
    choiceRank?: number;
    voteSources?: MobileGovernanceResponse['proposals'][number]['voteSources'];
  }) {
    if (!selectedWallet) {
      return;
    }

    const voteSources = (input.voteSources ?? []).filter((source) => !source.hasVoted);
    const fallbackSource = input.tokenOwnerRecordId
      ? [{
          tokenOwnerRecordId: input.tokenOwnerRecordId,
          governingTokenOwner: '',
          isDelegate: false,
          hasVoted: false
        }]
      : [];
    const effectiveVoteSources = voteSources.length > 0 ? voteSources : fallbackSource;

    if (effectiveVoteSources.length === 0) {
      setGovernanceVoteError('This wallet does not have a voting record for that proposal mint.');
      return;
    }

    try {
      setGovernanceVotingProposalId(input.proposalId);
      setGovernanceVoteError(null);
      setGovernanceVoteResult(null);
      const ownVoteSource = effectiveVoteSources.find((source) => !source.isDelegate) ?? effectiveVoteSources[0];
      const delegatedVoteSources = effectiveVoteSources.filter(
        (source) => source.isDelegate && source.tokenOwnerRecordId !== ownVoteSource.tokenOwnerRecordId
      );
      const selectedSources = [ownVoteSource];

      if (delegatedVoteSources.length > 0) {
        const delegatePrompt = delegatedVoteSources.length === 1
          ? `This proposal also has ${formatGovernanceVoteSourceLabel(delegatedVoteSources[0])}. Vote ${input.voteKind === 'approve' ? 'Approve' : 'Deny'} with that delegated voting power too?`
          : `This proposal also has ${delegatedVoteSources.length} delegated voting power sources. Vote ${input.voteKind === 'approve' ? 'Approve' : 'Deny'} with those delegated votes too?`;
        const includeDelegates = await new Promise<boolean>((resolve) => {
          Alert.alert('Delegated voting power', delegatePrompt, [
            { text: 'Only mine', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Vote all', onPress: () => resolve(true) }
          ], {
            cancelable: true,
            onDismiss: () => resolve(false)
          });
        });
        if (includeDelegates) {
          selectedSources.push(...delegatedVoteSources);
        }
      }

      let result: MobileGovernanceVoteResponse | null = null;
      for (const source of selectedSources) {
        result = await castWalletGovernanceVote({
          state: walletState,
          wallet: selectedWallet,
          daoId: input.daoId,
          governanceId: input.governanceId,
          proposalId: input.proposalId,
          proposalOwnerRecordId: input.proposalOwnerRecordId,
          tokenOwnerRecordId: source.tokenOwnerRecordId,
          governingTokenMint: input.governingTokenMint,
          voteKind: input.voteKind,
          choiceRank: input.choiceRank
        });
      }
      if (!result) {
        throw new Error('No eligible votes were available for this proposal.');
      }
      setGovernanceVoteResult(result);
      const nextGovernance = await loadWalletGovernance(selectedWallet, walletState.trackedGovernanceDaoIds);
      setGovernance(nextGovernance);
      Alert.alert('Vote submitted', result.signature);
    } catch (unknownError) {
      setGovernanceVoteError(unknownError instanceof Error ? unknownError.message : 'Unable to submit governance vote.');
    } finally {
      setGovernanceVotingProposalId(null);
    }
  }

  function renderMobileGovernanceProposalCard(
    proposal: MobileGovernanceResponse['proposals'][number],
    nowUnixSeconds: number
  ) {
    const timeMeta = getGovernanceProposalTimeMeta(proposal, nowUnixSeconds);
    const canVoteNow = proposal.canVote && timeMeta.votingWindowOpen;
    const proposalVoteSources = proposal.voteSources ?? [];
    const availableVoteSources = proposalVoteSources.filter((source) => !source.hasVoted);
    const hasProposalVoteSources = proposalVoteSources.length > 0;
    const hasDelegatedProposalVoteSource = availableVoteSources.some((source) => source.isDelegate);
    const proposalUrl = buildGovernanceProposalUrl(proposal.daoId, proposal.proposalId);
    const inactiveVotingPowerMessage =
      !timeMeta.votingWindowOpen && timeMeta.noteText
        ? timeMeta.noteText
        : proposal.hasVoted && availableVoteSources.length === 0
          ? 'This wallet already voted on the active proposal.'
          : availableVoteSources.length > 0
            ? hasDelegatedProposalVoteSource
              ? 'This wallet has delegated voting power available for this proposal.'
              : 'This wallet has voting power available for this proposal.'
            : hasProposalVoteSources
              ? 'This wallet has a proposal voter record, but that voting power is not currently available.'
              : proposal.votingPowerType === 'unknown'
                ? 'This wallet has governance power in this DAO, but the proposal voting class could not be resolved yet.'
                : 'This wallet is tracking the DAO, but it does not currently have voting power for this proposal.';

    return (
      <View key={proposal.proposalId} style={styles.sectionCard}>
        <View style={styles.governanceProposalHeader}>
          <View style={styles.governanceProposalCopy}>
            <Text style={styles.governanceProposalTitle}>{proposal.proposalName}</Text>
            <View style={styles.governanceProposalBadges}>
              <View style={styles.governanceStatusPill}>
                <Text style={styles.governanceStatusPillText}>{formatGovernanceVotingPowerType(proposal.votingPowerType)}</Text>
              </View>
              {proposal.isDelegate ? (
                <View style={styles.governanceStatusPill}>
                  <Text style={styles.governanceStatusPillText}>Delegate</Text>
                </View>
              ) : null}
              <View
                style={[
                  styles.governanceStatusPill,
                  timeMeta.badgeSuccess ? styles.governanceStatusPillSuccess : null
                ]}
              >
                <Text
                  style={[
                    styles.governanceStatusPillText,
                    timeMeta.badgeSuccess ? styles.governanceStatusPillTextSuccess : null
                  ]}
                >
                  {timeMeta.badgeLabel}
                </Text>
              </View>
              {timeMeta.votingWindowOpen && timeMeta.metaText ? (
                <View style={styles.governanceStatusPill}>
                  <Text style={styles.governanceStatusPillText}>{timeMeta.metaText}</Text>
                </View>
              ) : null}
              <Pressable
                style={styles.governanceOpenButton}
                onPress={() => void Linking.openURL(proposalUrl)}
              >
                <Text style={styles.governanceOpenButtonText}>Open</Text>
                <Feather name="external-link" size={16} color={activeTheme.text} />
              </Pressable>
            </View>
            <Text style={styles.sectionHint}>
              {proposal.realmName} • {proposal.state}
              {timeMeta.metaText ? ` • ${timeMeta.metaText}` : ''}
              {proposal.votingEndsAt ? ` • ${new Date(proposal.votingEndsAt * 1000).toLocaleString()}` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.governanceMetricsRow}>
          <Text style={styles.governanceMetricText}>Yes {formatWholeNumberString(proposal.yesVotes)}</Text>
          {BigInt(proposal.noVotes) > BigInt(0) ? (
            <Text style={styles.governanceMetricText}>No {formatWholeNumberString(proposal.noVotes)}</Text>
          ) : null}
          {BigInt(proposal.denyVotes) > BigInt(0) ? (
            <Text style={styles.governanceMetricText}>Deny {formatWholeNumberString(proposal.denyVotes)}</Text>
          ) : null}
        </View>

        {canVoteNow ? (
          <View style={styles.governanceVoteActions}>
            {proposal.choices.map((choice) => (
              <Pressable
                key={`${proposal.proposalId}:${choice.rank}`}
                style={styles.governanceVoteButton}
                disabled={governanceVotingProposalId === proposal.proposalId}
                onPress={() =>
                  void handleGovernanceVote({
                    daoId: proposal.daoId,
                    governanceId: proposal.governanceId,
                    proposalId: proposal.proposalId,
                    proposalOwnerRecordId: proposal.proposalOwnerRecordId,
                    tokenOwnerRecordId: proposal.tokenOwnerRecordId,
                    governingTokenMint: proposal.governingTokenMint,
                    voteKind: 'approve',
                    choiceRank: choice.rank,
                    voteSources: proposal.voteSources
                  })
                }
              >
                <Text style={styles.governanceVoteButtonText}>
                  {governanceVotingProposalId === proposal.proposalId ? 'Submitting...' : choice.label}
                </Text>
              </Pressable>
            ))}
            {proposal.hasDenyOption ? (
              <Pressable
                style={styles.governanceVoteButtonSecondary}
                disabled={governanceVotingProposalId === proposal.proposalId}
                onPress={() =>
                  void handleGovernanceVote({
                    daoId: proposal.daoId,
                    governanceId: proposal.governanceId,
                    proposalId: proposal.proposalId,
                    proposalOwnerRecordId: proposal.proposalOwnerRecordId,
                    tokenOwnerRecordId: proposal.tokenOwnerRecordId,
                    governingTokenMint: proposal.governingTokenMint,
                    voteKind: 'deny',
                    voteSources: proposal.voteSources
                  })
                }
              >
                <Text style={styles.governanceVoteButtonSecondaryText}>
                  {governanceVotingProposalId === proposal.proposalId ? 'Submitting...' : 'Deny'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Text style={styles.sectionHint}>
            {inactiveVotingPowerMessage}
          </Text>
        )}
      </View>
    );
  }

  async function handleDeleteWallet(wallet: MobileWallet) {
    Alert.alert('Delete wallet', `Remove ${wallet.name} from Grape on this device?`, [
      {
        text: 'Cancel',
        style: 'cancel'
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              const nextState = await removeMobileWallet({
                state: walletState,
                walletId: wallet.id
              });
              setWalletState(nextState);
              setError(null);
              setSelectedAssetId(null);
              setSendAssetId(null);
              setSendScreenVisible(false);
              if (nextState.setup !== 'ready' || nextState.wallets.length === 0) {
                setUnlocked(false);
                setScreen('setup');
                setMainTab('home');
              }
            } catch (unknownError) {
              setError(unknownError instanceof Error ? unknownError.message : 'Unable to delete wallet.');
            }
          })();
        }
      }
    ]);
  }

  async function handleVerifyExportPassword() {
    if (!selectedWallet) {
      return;
    }
    if (walletState.passkeyWallet) {
      setError('This wallet set does not use a user-entered password. Verify with the passkey instead.');
      return;
    }

    setExportLoading(true);
    setError(null);
    try {
      const exported = await exportMobileWalletPrivateKey({
        state: walletState,
        wallet: selectedWallet,
        password: exportPassword
      });
      setExportVerifiedWalletId(selectedWallet.id);
      setExportedPrivateKey(exported.privateKey);
      setExportReveal(true);
      setExportPassword('');
    } catch (unknownError) {
      setExportVerifiedWalletId(null);
      setExportedPrivateKey(null);
      setExportReveal(false);
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to verify password for export.');
    } finally {
      setExportLoading(false);
    }
  }

  async function handleVerifyExportWithPasskey() {
    if (!selectedWallet || !walletState.passkeyWallet || exportLoading || biometricLoading) {
      return;
    }

    setExportLoading(true);
    setError(null);
    setBiometricLoading(true);
    try {
      const password = await deriveCurrentPasskeyWalletPassword();
      const exported = await exportMobileWalletPrivateKey({
        state: walletState,
        wallet: selectedWallet,
        password
      });
      setExportVerifiedWalletId(selectedWallet.id);
      setExportedPrivateKey(exported.privateKey);
      setExportReveal(true);
      setExportPassword('');
    } catch (unknownError) {
      setExportVerifiedWalletId(null);
      setExportedPrivateKey(null);
      setExportReveal(false);
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to verify export with passkey.');
    } finally {
      setBiometricLoading(false);
      setExportLoading(false);
    }
  }

  async function handleBiometricVerifyExport() {
    if (!selectedWallet || !walletState.biometricEnabled || !biometricAvailable || exportLoading || biometricLoading) {
      return;
    }

    setError(null);
    setBiometricLoading(true);

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Verify to reveal export key',
        fallbackLabel: 'Use password',
        disableDeviceFallback: false
      });

      if (!result.success) {
        setError('Biometric verification was cancelled.');
        return;
      }

      const exported = await exportMobileWalletPrivateKey({
        state: walletState,
        wallet: selectedWallet,
        allowUnlockedSession: unlocked
      });
      setExportVerifiedWalletId(selectedWallet.id);
      setExportedPrivateKey(exported.privateKey);
      setExportReveal(true);
      setExportPassword('');
    } catch (unknownError) {
      setExportVerifiedWalletId(null);
      setExportedPrivateKey(null);
      setExportReveal(false);
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to verify export with biometrics.');
    } finally {
      setBiometricLoading(false);
    }
  }

  async function handleCreateDeviceLinkWithPassword() {
    if (!selectedWallet || !exportPassword.trim()) {
      return;
    }
    if (walletState.passkeyWallet) {
      setError('This wallet set does not use a user-entered password. Verify with the passkey instead.');
      return;
    }

    setDeviceLinkLoading(true);
    setError(null);
    try {
      const session = await createMobileDeviceLinkSession({
        state: walletState,
        wallet: selectedWallet,
        password: exportPassword
      });
      setDeviceLinkSession(session);
      setExportPassword('');
    } catch (unknownError) {
      setDeviceLinkSession(null);
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to create device link.');
    } finally {
      setDeviceLinkLoading(false);
    }
  }

  async function handleCreateDeviceLinkWithPasskey() {
    if (!selectedWallet || !walletState.passkeyWallet || deviceLinkLoading || biometricLoading) {
      return;
    }

    setDeviceLinkLoading(true);
    setError(null);
    setBiometricLoading(true);
    try {
      const password = await deriveCurrentPasskeyWalletPassword();
      const session = await createMobileDeviceLinkSession({
        state: walletState,
        wallet: selectedWallet,
        password
      });
      setDeviceLinkSession(session);
      setExportPassword('');
    } catch (unknownError) {
      setDeviceLinkSession(null);
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to create device link.');
    } finally {
      setBiometricLoading(false);
      setDeviceLinkLoading(false);
    }
  }

  async function handleCreateDeviceLinkWithBiometric() {
    if (!selectedWallet || !walletState.biometricEnabled || !biometricAvailable || deviceLinkLoading || biometricLoading) {
      return;
    }

    setError(null);
    setBiometricLoading(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Verify to link a new device',
        fallbackLabel: 'Use password',
        disableDeviceFallback: false
      });

      if (!result.success) {
        setError('Biometric verification was cancelled.');
        return;
      }

      const session = await createMobileDeviceLinkSession({
        state: walletState,
        wallet: selectedWallet,
        allowUnlockedSession: unlocked
      });
      setDeviceLinkSession(session);
    } catch (unknownError) {
      setDeviceLinkSession(null);
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to create device link.');
    } finally {
      setBiometricLoading(false);
    }
  }

  async function handleShareDeviceLink() {
    if (!deviceLinkSession) {
      return;
    }

    try {
      await Share.share({
        message: deviceLinkSession.qrPayload
      });
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to share restore payload.');
    }
  }

  async function handleOpenQrScanner(target: 'restore' | 'send') {
    setError(null);
    if (!cameraPermission?.granted) {
      const nextPermission = cameraPermission?.canAskAgain === false ? cameraPermission : await requestCameraPermission();
      if (!nextPermission?.granted) {
        setError(target === 'send' ? 'Camera access is required to scan a recipient QR.' : 'Camera access is required to scan a restore QR.');
        return;
      }
    }
    setQrScannerTarget(target);
    setQrScannerVisible(true);
  }

  function handleQrScanned(value: string) {
    if (qrScannerTarget === 'restore') {
      const normalizedPayload = normalizeScannedRestorePayloadInput(value);
      try {
        parseDeviceLinkPayloadText(normalizedPayload);
        setRestorePayload(normalizedPayload);
        setError(null);
      } catch {
        setError('The scanned QR is not a valid Grape restore payload.');
        return;
      }
    } else if (qrScannerTarget === 'send') {
      const recipient = normalizeScannedRecipientInput(value);
      if (recipient) {
        setSendRecipient(recipient);
        setError(null);
      }
    }
    setQrScannerVisible(false);
    setQrScannerTarget(null);
  }

  async function handleBiometricUnlock() {
    if (!walletState.biometricEnabled || !biometricAvailable || submitLoading || biometricLoading) {
      return;
    }

    setError(null);
    setBiometricLoading(true);

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Grape',
        fallbackLabel: 'Use password',
        disableDeviceFallback: false
      });

      if (!result.success) {
        setError('Biometric unlock was cancelled.');
        return;
      }

      setUnlocked(true);
      setUnlockPassword('');
      setScreen('ready');
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Biometric unlock failed.');
    } finally {
      setBiometricLoading(false);
    }
  }

  function handleLock() {
    setUnlocked(false);
    setMainTab('home');
    setSendScreenVisible(false);
    setScreen('locked');
  }

  function openSendScreen(assetId?: string | null) {
    setSwapScreenVisible(false);
    setBridgeScreenVisible(false);
    setSendAssetId(assetId ?? null);
    setSelectedAssetId(null);
    setSendRecipient('');
    setSendAmount('');
    setSendAssetSearch('');
    setSendAssetPickerVisible(false);
    setError(null);
    setSendScreenVisible(true);
  }

  function openSwapScreen(inputAssetId?: string | null, outputAssetId?: string | null) {
    setSendScreenVisible(false);
    setBridgeScreenVisible(false);
    setSelectedAssetId(null);
    setSwapInputAssetId(inputAssetId ?? null);
    setSwapOutputAssetId(outputAssetId ?? null);
    setSwapAmount('');
    setSwapQuote(null);
    setSwapSelectedRouteId(null);
    setSwapInputPickerVisible(false);
    setSwapOutputPickerVisible(false);
    setSwapAssetSearch('');
    setSwapError(null);
    setSwapScreenVisible(true);
  }

  function openBridgeScreen() {
    setSendScreenVisible(false);
    setSwapScreenVisible(false);
    setSelectedAssetId(null);
    setBridgeAmount('');
    setBridgeQuote(null);
    setBridgeSelectedRouteId(null);
    setBridgeError(null);
    setBridgeScreenVisible(true);
  }

  function renderBrandWordmark() {
    return (
      <Svg width={152} height={34} viewBox="0 0 152 34">
        <Defs>
          <SvgLinearGradient id="grapeWordmark" x1="0%" y1="50%" x2="100%" y2="50%">
            <Stop offset="0%" stopColor={activeTheme.brandGradient[0]} />
            <Stop offset="52%" stopColor={activeTheme.brandGradient[1]} />
            <Stop offset="100%" stopColor={activeTheme.brandGradient[2]} />
          </SvgLinearGradient>
        </Defs>
        <SvgText
          x="0"
          y="26"
          fill="url(#grapeWordmark)"
          fontSize="28"
          fontWeight="900"
          letterSpacing="0.8"
        >
          Grape
        </SvgText>
      </Svg>
    );
  }

  function renderBrandLogo(size = 42) {
    return (
      <Image
        source={GRAPE_LOGO_IMAGE}
        style={{ width: size, height: size, resizeMode: 'contain' }}
      />
    );
  }

  function renderAssetGlyph(asset: MobileAsset, size: number, textStyle: object, imageStyle: object) {
    if (asset.logoUri) {
      if (isSvgUri(asset.logoUri)) {
        return <SvgUri uri={asset.logoUri} width={size} height={size} />;
      }

      return (
        <Image
          source={{ uri: asset.logoUri }}
          style={imageStyle}
          resizeMode="cover"
        />
      );
    }

    return <Text style={textStyle}>{asset.symbol.slice(0, 1)}</Text>;
  }

  function renderMnemonicPills(mnemonic: string) {
    const words = mnemonic.trim().split(/\s+/).filter(Boolean);

    return (
      <View style={styles.mnemonicWordGrid}>
        {words.map((word, index) => (
          <View key={`${word}-${index}`} style={styles.mnemonicWordPill}>
            <Text style={styles.mnemonicWordIndex}>{index + 1}</Text>
            <Text style={styles.mnemonicWordText}>{word}</Text>
          </View>
        ))}
      </View>
    );
  }

  function renderSetupProgress(label: string) {
    return (
      <View style={styles.setupProgressShell}>
        <View style={styles.setupProgressHeader}>
          <ActivityIndicator color={activeTheme.grape} />
          <Text style={styles.setupProgressLabel}>{label}</Text>
        </View>
        <View style={styles.setupProgressTrack}>
          <Animated.View
            style={[
              styles.setupProgressFill,
              {
                backgroundColor: activeTheme.primaryButton,
                transform: [
                  {
                    translateX: launchHalo.interpolate({
                      inputRange: [0.28, 0.62],
                      outputRange: [-48, 48]
                    })
                  }
                ]
              }
            ]}
          />
        </View>
      </View>
    );
  }

  function renderSolanaCommunityShortcuts() {
    if (selectedWallet?.chain !== 'solana') {
      return null;
    }

    const reputationValue = reputationLoading
      ? 'Loading...'
      : reputation.spaces.length > 0
        ? `${totalEffectiveReputationPoints} pts`
        : walletState.trackedReputationSpaceIds.length > 0
          ? 'No points yet'
          : 'Add spaces';
    const reputationMeta = `${reputation.spaces.length} space${reputation.spaces.length === 1 ? '' : 's'}`;
    const governanceValue = governanceLoading
      ? 'Loading...'
      : actionableGovernanceProposalCount > 0
        ? `${actionableGovernanceProposalCount} ready`
        : governance.proposals.length > 0
          ? `${governance.proposals.length} active`
          : totalGovernanceDaoCount > 0
            ? 'Tracked'
            : 'Join DAOs';
    const governanceMeta = `${totalGovernanceDaoCount} DAO${totalGovernanceDaoCount === 1 ? '' : 's'}`;
    const verificationValue = trackedVerificationSpaceCount > 0 ? 'Verify now' : 'Add spaces';
    const verificationMeta = `${trackedVerificationSpaceCount} space${trackedVerificationSpaceCount === 1 ? '' : 's'}`;
    const handleVerificationPress = () => {
      if (trackedVerificationSpaceCount === 1 && walletState.trackedVerificationSpaceIds[0]) {
        void openVerificationSpace(walletState.trackedVerificationSpaceIds[0]);
        return;
      }
      setMainTab('settings');
    };

    return (
      <View style={styles.communityShortcutStack}>
        <View style={styles.communityShortcutRow}>
          <Pressable style={styles.communityShortcutCard} onPress={() => setMainTab('settings')}>
            <Text style={styles.communityShortcutLabel}>OG Reputation</Text>
            <Text style={styles.communityShortcutValue}>{reputationValue}</Text>
            <Text style={styles.communityShortcutMeta}>{reputationMeta}</Text>
          </Pressable>
          <Pressable style={styles.communityShortcutCard} onPress={() => setMainTab('governance')}>
            <Text style={styles.communityShortcutLabel}>Governance</Text>
            <Text style={styles.communityShortcutValue}>{governanceValue}</Text>
            <Text style={styles.communityShortcutMeta}>{governanceMeta}</Text>
          </Pressable>
        </View>
        <Pressable style={styles.communityInlineShortcut} onPress={handleVerificationPress}>
          <Text style={styles.communityInlineShortcutLabel}>Verification</Text>
          <Text style={styles.communityInlineShortcutValue}>{verificationValue}</Text>
          <Text style={styles.communityInlineShortcutMeta}>{verificationMeta}</Text>
        </Pressable>
      </View>
    );
  }

  function renderPasskeyRecoveryChoices() {
    return (
      <View style={styles.setupOptionStack}>
        <Pressable
          style={[
            styles.setupOptionCard,
            passkeyRecoveryMode === 'passkey-only' ? styles.setupOptionCardActive : null
          ]}
          onPress={() => {
            setPasskeyRecoveryMode('passkey-only');
            setConfirmBackedUp(false);
            setConfirmPasskeyOnlyAccess(false);
            setError(null);
          }}
        >
          <Text
            style={[
              styles.setupOptionTitle,
              passkeyRecoveryMode === 'passkey-only' ? styles.setupOptionTitleActive : null
            ]}
          >
            Passkey only
          </Text>
          <Text style={styles.setupOptionMeta}>The same passkey deterministically recreates the same wallet. If the passkey is lost and not synced elsewhere, the wallet can be lost.</Text>
        </Pressable>
        <Text style={styles.sectionHint}>Recovery phrase and trusted recovery are disabled for deterministic passkey wallets until a separate recovery design ships.</Text>
      </View>
    );
  }

  function renderSetupModeChoices() {
    return (
      <View style={styles.setupOptionStack}>
        <Pressable
          style={[
            styles.setupOptionCard,
            setupMode === 'create' ? styles.setupOptionCardActive : null
          ]}
          onPress={() => {
            setSetupMode('create');
            setConfirmBackedUp(false);
            setConfirmPasskeyOnlyAccess(false);
            setError(null);
          }}
        >
          <Text
            style={[
              styles.setupOptionTitle,
              setupMode === 'create' ? styles.setupOptionTitleActive : null
            ]}
          >
            Create wallet
          </Text>
          <Text style={styles.setupOptionMeta}>Generate a fresh recovery phrase and derive your mobile wallets from it.</Text>
        </Pressable>
        <Pressable
          style={[
            styles.setupOptionCard,
            setupMode === 'import' ? styles.setupOptionCardActive : null
          ]}
          onPress={() => {
            setSetupMode('import');
            setConfirmBackedUp(false);
            setConfirmPasskeyOnlyAccess(false);
            setError(null);
          }}
        >
          <Text
            style={[
              styles.setupOptionTitle,
              setupMode === 'import' ? styles.setupOptionTitleActive : null
            ]}
          >
            Import wallet
          </Text>
          <Text style={styles.setupOptionMeta}>Bring in an existing recovery phrase, private key, or Restore from Grape handoff.</Text>
        </Pressable>
      </View>
    );
  }

  function renderSetupScreen() {
    return (
      <KeyboardAvoidingView
        style={styles.screenFlex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingHorizontal: screenPadding
            }
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <Animated.View
            style={[
              styles.screenShell,
              {
                maxWidth: contentMaxWidth,
                opacity: screenEnterOpacity,
                transform: [{ translateY: screenEnterLift }, { scale: screenEnterScale }]
              }
            ]}
          >
            <View style={styles.heroBlock}>
              <View style={styles.logoOrb}>
                {renderBrandLogo(40)}
              </View>
              <Text style={styles.brand}>GRAPE</Text>
              <Text style={[styles.heroTitle, isCompact ? styles.heroTitleCompact : null]}>Set up your wallet</Text>
              <Text style={styles.heroCopy}>
                Generate a new recovery phrase or import an existing wallet. Recovery options stay explicit before you commit.
              </Text>
            </View>

            {renderSetupModeChoices()}

            <View style={[styles.sectionCard, styles.formCard]}>
              {setupMode === 'create' ? (
                <>
                  <Text style={styles.sectionTitle}>Recovery phrase</Text>
                  <Text style={styles.sectionHint}>Back up this 12-word or 24-word phrase before continuing.</Text>
                  <SegmentedButtons
                    value={String(mnemonicLength)}
                    onValueChange={(value) => setMnemonicLength(Number(value) as WalletMnemonicLength)}
                    buttons={[
                      { value: '12', label: '12 words' },
                      { value: '24', label: '24 words' }
                    ]}
                    style={styles.paperSegments}
                    density="small"
                  />
                  <View style={[styles.mnemonicCard, styles.formMnemonicCard]}>{renderMnemonicPills(generatedMnemonic)}</View>
                  <PaperButton mode="outlined" style={styles.paperSecondaryButton} onPress={() => setGeneratedMnemonic(createWalletMnemonic(mnemonicLength))}>
                    Generate a new phrase
                  </PaperButton>
                  <Pressable style={styles.checkboxRow} onPress={() => setConfirmBackedUp((value) => !value)}>
                    <Checkbox status={confirmBackedUp ? 'checked' : 'unchecked'} color={activeTheme.grape} />
                    <Text style={styles.checkboxLabel}>I backed up this recovery phrase.</Text>
                  </Pressable>
                </>
              ) : setupMode === 'passkey' ? (
                <>
                  <Text style={styles.sectionTitle}>Create with passkey</Text>
                  <Text style={styles.sectionHint}>
                    Derive this wallet directly from a native passkey. The same passkey recreates the same wallet from scratch.
                  </Text>
                  {!passkeyAvailable && passkeyUnavailableMessage ? <Text style={styles.errorText}>{passkeyUnavailableMessage}</Text> : null}
                  {renderPasskeyRecoveryChoices()}
                  {passkeyRecoveryMode === 'passkey-only' ? (
                    <>
                      <Text style={styles.sectionHint}>
                        No separate recovery phrase or user-entered password is created in this mode.
                      </Text>
                      <Pressable style={styles.checkboxRow} onPress={() => setConfirmPasskeyOnlyAccess((value) => !value)}>
                        <Checkbox status={confirmPasskeyOnlyAccess ? 'checked' : 'unchecked'} color={activeTheme.grape} />
                        <Text style={styles.checkboxLabel}>I understand that losing this passkey may permanently lock me out of this wallet.</Text>
                      </Pressable>
                    </>
                  ) : (
                    <Text style={styles.sectionHint}>Choose passkey only to continue.</Text>
                  )}
                  <Text style={styles.sectionHint}>Biometric-only unlock remains a separate local convenience mode you can enable later in settings.</Text>
                </>
              ) : (
                <>
                  <Text style={styles.sectionTitle}>Import wallet</Text>
                  <View style={styles.formChoiceRow}>
                    <Text style={styles.formChoiceLabel}>Import with</Text>
                    <SegmentedButtons
                      value={importKind}
                      onValueChange={(value) => setImportKind(value as ImportKind)}
                      buttons={[
                        { value: 'mnemonic', label: 'Recovery phrase' },
                        { value: 'private-key', label: 'Private key' },
                        { value: 'restore', label: 'Restore from Grape' }
                      ]}
                      style={styles.paperSegments}
                      density="small"
                    />
                  </View>
                  {importKind === 'mnemonic' ? (
                    <PaperTextInput
                      value={importMnemonic}
                      onChangeText={setImportMnemonic}
                      placeholder="Enter your 12-word or 24-word recovery phrase"
                      mode="outlined"
                      multiline
                      style={styles.paperInput}
                      contentStyle={[styles.paperInputContent, styles.paperTextAreaContent]}
                      outlineStyle={styles.paperOutline}
                      textColor={activeTheme.text}
                    />
                  ) : importKind === 'private-key' ? (
                    <>
                      <SegmentedButtons
                        value={importPrivateKeyChain}
                        onValueChange={(value) => setImportPrivateKeyChain(value as MobileWalletState['selectedChain'])}
                        buttons={chains.map((item) => ({ value: item.id, label: item.short }))}
                        style={styles.paperSegments}
                        density="small"
                      />
                      <PaperTextInput
                        value={importPrivateKey}
                        onChangeText={setImportPrivateKey}
                        placeholder={`Enter your ${chainMeta(importPrivateKeyChain).label} private key`}
                        mode="outlined"
                        multiline
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={styles.paperInput}
                        contentStyle={[styles.paperInputContent, styles.paperTextAreaContent]}
                        outlineStyle={styles.paperOutline}
                        textColor={activeTheme.text}
                      />
                    </>
                  ) : (
                    <>
                      <Text style={styles.sectionHint}>Scan the QR from another Grape device or paste the restore payload manually.</Text>
                      <View style={styles.walletToolsRow}>
                        <PaperButton
                          mode="outlined"
                          style={[styles.paperSecondaryButton, styles.walletToolButton]}
                          onPress={() => void handleOpenQrScanner('restore')}
                        >
                          Scan QR
                        </PaperButton>
                      </View>
                      <PaperTextInput
                        value={restorePayload}
                        onChangeText={(value) => setRestorePayload(normalizeScannedRestorePayloadInput(value))}
                        placeholder="Paste restore payload"
                        mode="outlined"
                        multiline
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={styles.paperInput}
                        contentStyle={[styles.paperInputContent, styles.paperTextAreaContent]}
                        outlineStyle={styles.paperOutline}
                        textColor={activeTheme.text}
                      />
                      {parsedRestorePayload ? (
                        <View style={styles.exportSecretCard}>
                          <Text style={styles.exportSecretLabel}>{parsedRestorePayload.walletName}</Text>
                          <Text style={styles.sectionHint}>
                            {chainMeta(parsedRestorePayload.chain).label} · {formatShortAddress(parsedRestorePayload.publicKey)}
                          </Text>
                          <Text style={styles.sectionHint}>Expires {new Date(parsedRestorePayload.expiresAt).toLocaleString()}</Text>
                        </View>
                      ) : restorePayload.trim() ? (
                        <Text style={styles.sectionHint}>The restore payload could not be parsed yet. Scan again or copy it again from the existing Grape device.</Text>
                      ) : null}
                      <PaperTextInput
                        value={restorePairingCode}
                        onChangeText={setRestorePairingCode}
                        placeholder="Pairing code"
                        mode="outlined"
                        autoCapitalize="characters"
                        autoCorrect={false}
                        style={styles.paperInput}
                        contentStyle={styles.paperInputContent}
                        outlineStyle={styles.paperOutline}
                        textColor={activeTheme.text}
                      />
                    </>
                  )}
                </>
              )}

              {setupMode !== 'passkey' ? (
                <>
                  <PaperTextInput
                    value={setupPassword}
                    onChangeText={setSetupPassword}
                    placeholder="Password"
                    secureTextEntry
                    mode="outlined"
                    style={styles.paperInput}
                    contentStyle={styles.paperInputContent}
                    outlineStyle={styles.paperOutline}
                    textColor={activeTheme.text}
                  />
                  <PaperTextInput
                    value={setupPasswordConfirm}
                    onChangeText={setSetupPasswordConfirm}
                    placeholder="Confirm password"
                    secureTextEntry
                    mode="outlined"
                    style={styles.paperInput}
                    contentStyle={styles.paperInputContent}
                    outlineStyle={styles.paperOutline}
                    textColor={activeTheme.text}
                  />
                </>
              ) : null}

              {submitLoading
                ? renderSetupProgress(submitStatus ?? 'Working…')
                : null}

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <PaperButton
                mode="contained"
                style={styles.paperPrimaryButton}
                buttonColor={activeTheme.primaryButton}
                textColor={activeTheme.primaryButtonText}
                disabled={submitLoading}
                onPress={() => void (setupMode === 'create' ? handleCreateWallet() : setupMode === 'passkey' ? handleCreatePasskeyWallet() : handleImportWallet())}
              >
                {submitLoading ? 'Please wait…' : setupMode === 'create' ? 'Create wallet' : setupMode === 'passkey' ? 'Create with passkey' : 'Import wallet'}
              </PaperButton>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  function renderLockedScreen() {
    const lockHaloScale = lockHaloPulse.interpolate({
      inputRange: [0.08, 0.14],
      outputRange: [1, 1.06]
    });
    const lockLogoOpacity = lockHaloPulse.interpolate({
      inputRange: [0.08, 0.14],
      outputRange: [0.94, 0.98]
    });

    return (
      <KeyboardAvoidingView
        style={styles.screenFlex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.lockedScrollContent,
            {
              paddingHorizontal: screenPadding
            }
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <Animated.View
            style={[
              styles.lockedCard,
              {
                maxWidth: contentMaxWidth,
                opacity: screenEnterOpacity,
                transform: [{ translateY: screenEnterLift }, { scale: screenEnterScale }]
              }
            ]}
          >
            <Animated.View
              style={[
                styles.lockLogoCluster,
                {
                  opacity: lockLogoOpacity,
                  transform: [{ scale: lockBreathScale }]
                }
              ]}
            >
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.lockLogoHalo,
                  {
                    opacity: lockHaloPulse.interpolate({
                      inputRange: [0.04, 0.085],
                      outputRange: [0.03, 0.08]
                    }),
                    transform: [{ scale: lockHaloScale }]
                  }
                ]}
              />
              <View style={styles.logoOrb}>
                {renderBrandLogo(40)}
              </View>
            </Animated.View>
            <Text style={styles.brand}>GRAPE</Text>
            <Text style={[styles.lockedTitle, isCompact ? styles.lockedTitleCompact : null]}>Unlock your wallet</Text>
            <Text style={styles.sectionHint}>
              {walletState.passkeyWallet
                ? 'Unlock once per session with the same passkey that deterministically recreates this wallet.'
                : 'Unlock once per session to use your multi-chain wallet on mobile.'}
            </Text>
            {walletState.passkeyWallet ? (
              <>
                {!passkeyAvailable && passkeyUnavailableMessage ? <Text style={styles.errorText}>{passkeyUnavailableMessage}</Text> : null}
                <PaperButton
                  mode="contained"
                  style={styles.paperPrimaryButton}
                  buttonColor={activeTheme.primaryButton}
                  textColor={activeTheme.primaryButtonText}
                  disabled={biometricLoading || submitLoading || !passkeyAvailable}
                  onPress={() => void handlePasskeyUnlock()}
                >
                  {biometricLoading ? 'Checking passkey...' : 'Unlock with passkey'}
                </PaperButton>
              </>
            ) : (
              <PaperTextInput
                value={unlockPassword}
                onChangeText={setUnlockPassword}
                placeholder="Password"
                secureTextEntry
                mode="outlined"
                style={styles.paperInput}
                contentStyle={styles.paperInputContent}
                outlineStyle={styles.paperOutline}
                textColor={activeTheme.text}
                right={
                  walletState.biometricEnabled && biometricAvailable ? (
                    <PaperTextInput.Icon
                      icon="fingerprint"
                      onPress={() => void handleBiometricUnlock()}
                      disabled={biometricLoading || submitLoading}
                      forceTextInputFocus={false}
                    />
                  ) : undefined
                }
              />
            )}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {!walletState.passkeyWallet ? (
              <PaperButton
                mode="contained"
                style={styles.paperPrimaryButton}
                buttonColor={activeTheme.primaryButton}
                textColor={activeTheme.primaryButtonText}
                disabled={submitLoading}
                onPress={() => void handleUnlock()}
              >
                {submitLoading ? 'Unlocking...' : 'Unlock'}
              </PaperButton>
            ) : null}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  function renderDiscoverTab() {
    return (
      <View style={[styles.discoverScreen, { paddingBottom: footerInset + 92 }]}>
        <View style={styles.discoverBrowserBar}>
          <View style={styles.discoverBrowserBarPrimary}>
            <View style={styles.discoverHeaderCopy}>
              <Text style={styles.sectionTitle}>Grape Discover</Text>
              <Text style={styles.discoverWebviewMeta}>{discoverCurrentUrl || discoverUrl}</Text>
            </View>
            <View style={styles.discoverBrowserBarActions}>
              <View style={styles.discoverBetaPill}>
                <Text style={styles.discoverBetaPillText}>Solana beta</Text>
              </View>
              <Pressable
                style={styles.discoverControlButton}
                onPress={() => setDiscoverControlsExpanded((currentValue) => !currentValue)}
              >
                <Feather
                  name={discoverControlsExpanded ? 'chevron-up' : 'sliders'}
                  size={18}
                  color={activeTheme.text}
                />
              </Pressable>
            </View>
          </View>

          {discoverControlsExpanded ? (
            <>
              {!discoverWallet ? (
                <View style={styles.discoverEmptyCard}>
                  <Text style={styles.discoverEmptyTitle}>Add a Solana wallet to use Discover.</Text>
                  <Text style={styles.sectionHint}>
                    Grape Discover currently injects the Solana provider only. Create or import a Solana wallet first.
                  </Text>
                </View>
              ) : null}

              <View style={styles.discoverToolbar}>
                <PaperTextInput
                  value={discoverUrlInput}
                  onChangeText={setDiscoverUrlInput}
                  placeholder="Enter a Solana app URL"
                  mode="outlined"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.paperInput, styles.discoverAddressInput]}
                  contentStyle={styles.paperInputContent}
                  outlineStyle={styles.paperOutline}
                  textColor={activeTheme.text}
                  onSubmitEditing={() => handleDiscoverNavigate()}
                />
                <PaperButton
                  mode="contained"
                  style={styles.discoverGoButton}
                  buttonColor={activeTheme.primaryButton}
                  textColor={activeTheme.primaryButtonText}
                  onPress={() => handleDiscoverNavigate()}
                >
                  Open
                </PaperButton>
              </View>

              <View style={styles.discoverControls}>
                <Pressable
                  style={[styles.discoverControlButton, !discoverCanGoBack ? styles.discoverControlButtonDisabled : null]}
                  disabled={!discoverCanGoBack}
                  onPress={() => discoverWebViewRef.current?.goBack()}
                >
                  <Feather name="chevron-left" size={18} color={discoverCanGoBack ? activeTheme.text : activeTheme.muted} />
                </Pressable>
                <Pressable
                  style={[styles.discoverControlButton, !discoverCanGoForward ? styles.discoverControlButtonDisabled : null]}
                  disabled={!discoverCanGoForward}
                  onPress={() => discoverWebViewRef.current?.goForward()}
                >
                  <Feather name="chevron-right" size={18} color={discoverCanGoForward ? activeTheme.text : activeTheme.muted} />
                </Pressable>
                <Pressable style={styles.discoverControlButton} onPress={() => discoverWebViewRef.current?.reload()}>
                  <MaterialCommunityIcons name="refresh" size={18} color={activeTheme.text} />
                </Pressable>
                <Pressable style={styles.discoverControlButton} onPress={() => void Linking.openURL(discoverCurrentUrl || discoverUrl)}>
                  <Feather name="external-link" size={18} color={activeTheme.text} />
                </Pressable>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.discoverFavoriteRow}>
                {GRAPE_DISCOVER_FAVORITES.map((favorite) => (
                  <Pressable
                    key={favorite.url}
                    style={styles.discoverFavoriteCard}
                    onPress={() => handleDiscoverNavigate(favorite.url)}
                  >
                    <Text style={styles.discoverFavoriteTitle}>{favorite.label}</Text>
                    <Text style={styles.discoverFavoriteSubtitle}>{favorite.subtitle}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}
        </View>

        <View style={styles.discoverWebviewShell}>
          {discoverLoadError ? (
            <View style={styles.discoverInlineError}>
              <Text style={styles.errorText}>{discoverLoadError}</Text>
            </View>
          ) : null}
          <View style={styles.discoverWebviewFrame}>
            <WebView
              ref={discoverWebViewRef}
              source={{ uri: discoverUrl }}
              originWhitelist={['http://*', 'https://*']}
              injectedJavaScriptBeforeContentLoaded={GRAPE_DISCOVER_INJECTED_JS}
              injectedJavaScript={GRAPE_DISCOVER_INJECTED_JS}
              onMessage={handleDiscoverProviderMessage}
              onNavigationStateChange={handleDiscoverNavigationStateChange}
              onShouldStartLoadWithRequest={(request) => handleDiscoverShouldStart(request.url)}
              onError={(event) => {
                const failingUrl = event.nativeEvent.url || discoverUrlInput || discoverUrl;
                const description = event.nativeEvent.description || 'Unable to load the page.';
                setDiscoverLoadError(`${description} (${failingUrl})`);
              }}
              onHttpError={(event) => {
                const failingUrl = event.nativeEvent.url || discoverUrlInput || discoverUrl;
                setDiscoverLoadError(`HTTP ${event.nativeEvent.statusCode} while loading ${failingUrl}`);
              }}
              onLoadStart={() => {
                setDiscoverLoadError(null);
              }}
              setSupportMultipleWindows={false}
              javaScriptEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              style={styles.discoverWebview}
            />
          </View>
        </View>
      </View>
    );
  }

  function renderHomeTab() {
    const refreshRotation = refreshSpin.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg']
    });

    if (selectedAsset) {
      const selectedAssetAddress = selectedAsset.address ?? '--';
      const canSwapSelectedAsset = swappableAssets.some((asset) => asset.id === selectedAsset.id);
      const metadataSourceLabel =
        selectedAsset.metadataSource === 'shyft'
          ? 'Shyft'
          : selectedAsset.metadataSource === 'rpc'
            ? 'RPC'
            : 'Native';

      return (
        <View style={styles.stack}>
          <View style={[styles.sectionCard, styles.assetDetailHeroCard]}>
            <Pressable style={styles.detailBackRow} onPress={() => setSelectedAssetId(null)}>
              <Feather name="chevron-left" size={18} color={activeTheme.text} />
              <Text style={styles.detailBackText}>Back to holdings</Text>
            </Pressable>

            <View style={styles.assetDetailHeader}>
              <View style={styles.assetDetailGlyph}>
                {renderAssetGlyph(selectedAsset, 68, styles.assetDetailGlyphText, styles.assetDetailGlyphImage)}
              </View>
              <View style={styles.assetDetailCopy}>
                <Text style={styles.assetDetailName}>{selectedAsset.name}</Text>
                <Text style={styles.assetDetailSymbol}>{selectedAsset.symbol}</Text>
              </View>
            </View>

            <View style={styles.assetDetailAddressCard}>
              <Text style={styles.assetDetailLabel}>Token address</Text>
              <Text style={styles.assetDetailAddressValue}>{selectedAssetAddress}</Text>
            </View>

            <View style={styles.assetDetailBalanceBlock}>
              <Text style={styles.assetDetailLabel}>Token amount in wallet</Text>
              <Text style={styles.assetDetailBalance}>{maskValue(selectedAsset.amountLabel, walletState.privacyMode)}</Text>
              {selectedAsset.valueLabel ? (
                <Text style={styles.assetDetailBalanceMeta}>
                  Estimated value {maskValue(selectedAsset.valueLabel, walletState.privacyMode)}
                </Text>
              ) : null}
            </View>

            <View style={styles.assetDetailActionsRow}>
              <Pressable style={styles.assetDetailActionButton} onPress={() => openSendScreen(selectedAsset.id)}>
                <MaterialCommunityIcons name="send-outline" size={22} color={activeTheme.text} />
                <Text style={styles.assetDetailActionLabel}>Send</Text>
              </Pressable>
              <Pressable
                style={canSwapSelectedAsset ? styles.assetDetailActionButton : styles.assetDetailActionButtonDisabled}
                onPress={canSwapSelectedAsset ? () => openSwapScreen(selectedAsset.id) : undefined}
              >
                <MaterialCommunityIcons
                  name="swap-horizontal"
                  size={22}
                  color={canSwapSelectedAsset ? activeTheme.text : activeTheme.muted}
                />
                <Text style={canSwapSelectedAsset ? styles.assetDetailActionLabel : styles.assetDetailActionLabelMuted}>Swap</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.assetDetailSectionHeader}>
              <Text style={styles.sectionTitle}>Token metadata</Text>
              <Text style={styles.assetDetailSectionHint}>Chain, wallet, and token details</Text>
            </View>

            <View style={styles.assetDetailStats}>
              <View style={styles.assetDetailMetaRow}>
                <Text style={styles.assetDetailLabel}>Chain</Text>
                <Text style={styles.assetDetailMeta}>{selectedChainMeta.label}</Text>
              </View>
              <View style={styles.assetDetailMetaRow}>
                <Text style={styles.assetDetailLabel}>Wallet</Text>
                <Text style={styles.assetDetailMeta}>{selectedWallet?.name ?? '--'}</Text>
              </View>
              <View style={styles.assetDetailMetaRow}>
                <Text style={styles.assetDetailLabel}>Symbol</Text>
                <Text style={styles.assetDetailMeta}>{selectedAsset.symbol}</Text>
              </View>
              <View style={styles.assetDetailMetaRow}>
                <Text style={styles.assetDetailLabel}>Metadata source</Text>
                <Text style={styles.assetDetailMeta}>{metadataSourceLabel}</Text>
              </View>
              {selectedAsset.tokenType ? (
                <View style={styles.assetDetailMetaRow}>
                  <Text style={styles.assetDetailLabel}>Token type</Text>
                  <Text style={styles.assetDetailMeta}>{selectedAsset.tokenType}</Text>
                </View>
              ) : null}
              {typeof selectedAsset.decimals === 'number' ? (
                <View style={styles.assetDetailMetaRow}>
                  <Text style={styles.assetDetailLabel}>Decimals</Text>
                  <Text style={styles.assetDetailMeta}>{selectedAsset.decimals}</Text>
                </View>
              ) : null}
              {selectedAsset.accountAddress ? (
                <View style={styles.assetDetailStat}>
                  <Text style={styles.assetDetailLabel}>Account address</Text>
                  <Text style={styles.assetDetailMetaMono}>{selectedAsset.accountAddress}</Text>
                </View>
              ) : null}
              {selectedAsset.programId ? (
                <View style={styles.assetDetailStat}>
                  <Text style={styles.assetDetailLabel}>Program ID</Text>
                  <Text style={styles.assetDetailMetaMono}>{selectedAsset.programId}</Text>
                </View>
              ) : null}
              {selectedAsset.description ? (
                <View style={styles.assetDetailStat}>
                  <Text style={styles.assetDetailLabel}>Details</Text>
                  <Text style={styles.assetDetailMeta}>{selectedAsset.description}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      );
    }

    return (
      <>
        <View style={styles.heroCard}>
          <View style={styles.cardTopRow}>
            <View style={styles.walletIdentity}>
              <Pressable
                style={[styles.walletAvatar, styles.walletAvatarButton, { borderColor: `${selectedChainMeta.accent}55`, backgroundColor: `${selectedChainMeta.accent}1f` }]}
                onPress={() => setChainPickerVisible(true)}
              >
                <Text style={[styles.walletAvatarText, { color: selectedChainMeta.accent }]}>{selectedChainMeta.short}</Text>
                <View style={styles.walletAvatarSwitchBadge}>
                  <Feather name="repeat" size={11} color={activeTheme.text} />
                </View>
              </Pressable>
              <View style={styles.walletIdentityCopy}>
                <Text style={styles.cardName}>{selectedWallet?.name ?? '--'}</Text>
                <Text style={styles.walletIdentityMeta}>{selectedChainMeta.label} · Tap icon to switch</Text>
              </View>
            </View>
            <Pressable style={styles.refreshChip} onPress={() => void handleRefreshAssets()}>
              <Animated.View style={[styles.refreshGlyphWrap, { transform: [{ rotate: refreshRotation }] }]}>
                <MaterialCommunityIcons name="refresh" size={22} color={activeTheme.text} />
              </Animated.View>
            </Pressable>
          </View>

          <Text style={styles.cardAddress}>{selectedWallet ? shortenAddress(selectedWallet.address) : '--'}</Text>

          <View style={styles.balanceBlock}>
            <Text style={styles.cardLabel}>Holdings</Text>
            <Text style={styles.cardBalance}>{maskValue(holdingsSummary, walletState.privacyMode)}</Text>
            <Text style={styles.cardSubtle}>{assets.length} asset{assets.length === 1 ? '' : 's'} in this wallet</Text>
          </View>

          <View style={styles.quickActionsRow}>
            <Pressable style={styles.quickActionButton} onPress={() => openSendScreen()}>
              <MaterialCommunityIcons name="send-outline" size={24} color={activeTheme.text} />
              <Text style={styles.quickActionLabel}>Send</Text>
            </Pressable>
            <Pressable style={styles.quickActionButton} onPress={() => setMainTab('receive')}>
              <MaterialCommunityIcons name="qrcode" size={24} color={activeTheme.text} />
              <Text style={styles.quickActionLabel}>Receive</Text>
            </Pressable>
            <Pressable
              style={selectedWallet?.chain === 'solana' ? styles.quickActionButton : styles.quickActionButtonDisabled}
              onPress={selectedWallet?.chain === 'solana' ? () => openSwapScreen() : undefined}
            >
              <MaterialCommunityIcons name="swap-horizontal" size={24} color={selectedWallet?.chain === 'solana' ? activeTheme.text : activeTheme.muted} />
              <Text style={selectedWallet?.chain === 'solana' ? styles.quickActionLabel : styles.quickActionLabelMuted}>Swap</Text>
            </Pressable>
            <Pressable
              style={selectedWallet && bridgeDestinationChains.length > 0 ? styles.quickActionButton : styles.quickActionButtonDisabled}
              onPress={selectedWallet && bridgeDestinationChains.length > 0 ? () => openBridgeScreen() : undefined}
            >
              <MaterialCommunityIcons
                name="transit-connection-variant"
                size={24}
                color={selectedWallet && bridgeDestinationChains.length > 0 ? activeTheme.text : activeTheme.muted}
              />
              <Text style={selectedWallet && bridgeDestinationChains.length > 0 ? styles.quickActionLabel : styles.quickActionLabelMuted}>Bridge</Text>
            </Pressable>
          </View>
        </View>

        {renderSolanaCommunityShortcuts()}

        <Pressable style={styles.discoverPromoCard} onPress={() => setMainTab('discover')}>
          <View style={styles.discoverPromoCopy}>
            <Text style={styles.discoverPromoEyebrow}>Grape Discover</Text>
            <Text style={styles.discoverPromoTitle}>Open Solana apps directly inside Grape.</Text>
            <Text style={styles.sectionHint}>Connect, sign, and stay in the wallet with a native approval flow.</Text>
          </View>
          <View style={styles.discoverPromoGlyph}>
            <MaterialCommunityIcons name="compass-outline" size={26} color={activeTheme.text} />
          </View>
        </Pressable>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Wallets</Text>
            <Text style={styles.sectionHint}>{chainWallets.length} on {selectedChainMeta.label}</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.walletSwitchRow}
          >
            {chainWallets.map((wallet) => {
              const active = wallet.id === selectedWallet?.id;
              return (
                <Pressable
                  key={wallet.id}
                  style={[styles.walletSwitchChip, active ? styles.walletSwitchChipActive : null]}
                  onPress={() => void handleSelectWallet(wallet.id, wallet.chain)}
                >
                  <Text style={[styles.walletSwitchChipTitle, active ? styles.walletSwitchChipTitleActive : null]}>
                    {wallet.name}
                  </Text>
                  <Text style={styles.walletSwitchChipAddress}>{shortenAddress(wallet.address)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Holdings</Text>
            <Text style={styles.sectionHint}>
              {assetsLoading ? 'Refreshing' : `${assets.length} asset${assets.length === 1 ? '' : 's'}`}
            </Text>
          </View>
          <View style={styles.stack}>
            {assetsLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={activeTheme.grape} />
                <Text style={styles.sectionHint}>Loading holdings...</Text>
              </View>
            ) : assets.length === 0 ? (
              <Text style={styles.sectionHint}>No assets found for this wallet.</Text>
            ) : (
              assets.map((asset) => (
                (() => {
                  const assetSubtitle = getAssetSubtitle(asset, selectedChainMeta.label, selectedChainMeta.short);
                  return (
                    <Pressable key={asset.id} style={styles.assetRow} onPress={() => setSelectedAssetId(asset.id)}>
                      <View style={styles.assetGlyph}>
                        {renderAssetGlyph(asset, 52, styles.assetGlyphText, styles.assetGlyphImage)}
                      </View>
                      <View style={styles.assetCopy}>
                        <Text style={styles.assetName}>{asset.name}</Text>
                        {assetSubtitle ? <Text style={styles.assetMeta}>{assetSubtitle}</Text> : null}
                      </View>
                      <View style={styles.assetValueStack}>
                        <Text style={styles.assetValue}>{maskValue(asset.amountLabel, walletState.privacyMode)}</Text>
                        {asset.valueLabel ? (
                          <Text style={styles.assetValueMeta}>{maskValue(asset.valueLabel, walletState.privacyMode)}</Text>
                        ) : null}
                      </View>
                      <Feather name="chevron-right" size={20} color={activeTheme.muted} style={styles.rowChevronIcon} />
                    </Pressable>
                  );
                })()
              ))
            )}
          </View>
        </View>

      </>
    );
  }

  function renderReceiveTab() {
    return (
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Receive</Text>
        <Text style={styles.sectionHint}>Use this QR code or address to receive assets on {selectedChainMeta.label}.</Text>
        <View style={styles.qrCard}>
          {selectedWallet?.address ? (
            <View style={styles.qrSurface}>
              <QRCode
                value={selectedWallet.address}
                size={220}
                color="#F8F4FF"
                backgroundColor="transparent"
              />
            </View>
          ) : (
            <View style={styles.qrPlaceholder}>
              <Text style={styles.qrPlaceholderText}>Preparing QR</Text>
            </View>
          )}
        </View>
        <View style={styles.receiveAddressCard}>
          <Text style={styles.receiveAddressLabel}>{selectedWallet?.name ?? 'Wallet'}</Text>
          <Text style={styles.receiveAddressValue}>{selectedWallet?.address ?? '--'}</Text>
        </View>
        <Pressable style={styles.primaryButton} onPress={() => void handleShareAddress()}>
          <Text style={styles.primaryButtonText}>Share address</Text>
        </Pressable>
      </View>
    );
  }

  function renderGovernanceTab() {
    if (selectedWallet?.chain !== 'solana') {
      return (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Governance</Text>
          <Text style={styles.sectionHint}>Governance proposal tracking and voting are currently available for Solana wallets only.</Text>
        </View>
      );
    }

    return (
      <View style={styles.stack}>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Governance</Text>
          <Text style={styles.sectionHint}>
            Follow active proposals for the DAOs this wallet participates in and cast votes directly from mobile.
          </Text>
          <View style={styles.reputationSummaryGrid}>
            <View style={styles.reputationSummaryCard}>
              <Text style={styles.reputationSummaryLabel}>Active proposals</Text>
              <Text style={styles.reputationSummaryValue}>{governance.proposals.length}</Text>
            </View>
            <View style={styles.reputationSummaryCard}>
              <Text style={styles.reputationSummaryLabel}>Participating DAOs</Text>
              <Text style={styles.reputationSummaryValue}>{totalGovernanceDaoCount}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Your DAOs</Text>
          <Text style={styles.sectionHint}>
            Open the DAOs this wallet already participates in directly in Grape Discover.
          </Text>
          {governanceLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={activeTheme.grape} />
              <Text style={styles.sectionHint}>Loading DAO memberships...</Text>
            </View>
          ) : governance.daos.length > 0 ? (
            <View style={styles.stack}>
              {governance.daos.map((dao) => (
                <View key={`member-dao:${dao.daoId}`} style={styles.governanceEligibilityCard}>
                  <View style={styles.governanceProposalCopy}>
                    <Text style={styles.governanceProposalTitle}>{dao.realmName}</Text>
                    <View style={styles.governanceProposalBadges}>
                      <View style={[styles.governanceStatusPill, styles.governanceStatusPillSuccess]}>
                        <Text style={[styles.governanceStatusPillText, styles.governanceStatusPillTextSuccess]}>
                          Participating
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.sectionHint}>{dao.daoId}</Text>
                  </View>
                  <View style={styles.governanceEligibilityActions}>
                    <PaperButton
                      mode="contained"
                      style={styles.paperPrimaryButton}
                      buttonColor={activeTheme.primaryButton}
                      textColor={activeTheme.primaryButtonText}
                      onPress={() => openGovernanceDaoInDiscover(dao.daoId)}
                    >
                      Open
                    </PaperButton>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.sectionHint}>No participating DAOs are loaded for this wallet yet.</Text>
          )}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.settingsCopy}>
              <Text style={styles.sectionTitle}>Scan wallet holdings</Text>
              <Text style={styles.sectionHint}>
                Find DAOs where this wallet already holds the community or council token, then jump straight to deposit.
              </Text>
            </View>
            <PaperButton
              mode="contained"
              style={styles.paperPrimaryButton}
              buttonColor={activeTheme.primaryButton}
              textColor={activeTheme.primaryButtonText}
              disabled={assetsLoading || governanceEligibilityLoading}
              onPress={() => void handleScanGovernanceEligibility()}
            >
              {governanceEligibilityLoading ? 'Scanning...' : 'Scan'}
            </PaperButton>
          </View>

          {assetsLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={activeTheme.grape} />
              <Text style={styles.sectionHint}>Load wallet holdings before scanning DAO eligibility.</Text>
            </View>
          ) : null}

          {!assetsLoading && governanceEligibilityError ? (
            <Text style={styles.errorText}>{governanceEligibilityError}</Text>
          ) : null}

          {!assetsLoading && !governanceEligibilityLoading && governanceEligibility.length > 0 ? (
            <View style={styles.stack}>
              {governanceEligibility.map((dao) => {
                const isParticipating = participatingGovernanceDaoIds.has(dao.daoId);
                return (
                  <View key={dao.daoId} style={styles.governanceEligibilityCard}>
                    <View style={styles.governanceProposalCopy}>
                      <Text style={styles.governanceProposalTitle}>{dao.realmName}</Text>
                      <View style={styles.governanceProposalBadges}>
                        {dao.communityHolding ? (
                          <View style={styles.governanceStatusPill}>
                            <Text style={styles.governanceStatusPillText}>Community</Text>
                          </View>
                        ) : null}
                        {dao.councilHolding ? (
                          <View style={styles.governanceStatusPill}>
                            <Text style={styles.governanceStatusPillText}>Council</Text>
                          </View>
                        ) : null}
                        {isParticipating ? (
                          <View style={[styles.governanceStatusPill, styles.governanceStatusPillSuccess]}>
                            <Text style={[styles.governanceStatusPillText, styles.governanceStatusPillTextSuccess]}>
                              Participating
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.sectionHint}>
                        {dao.communityHolding ? `Community: ${dao.communityHolding.amountLabel ?? dao.communityHolding.amountUi}` : null}
                        {dao.communityHolding && dao.councilHolding ? ' • ' : ''}
                        {dao.councilHolding ? `Council: ${dao.councilHolding.amountLabel ?? dao.councilHolding.amountUi}` : null}
                      </Text>
                    </View>
                    <View style={styles.governanceEligibilityActions}>
                      {!isParticipating ? (
                        <PaperButton
                          mode="outlined"
                          style={styles.paperSecondaryButton}
                          disabled={governanceSaving}
                          onPress={() => void handleTrackGovernanceDaoDirect(dao.daoId)}
                        >
                          Track
                        </PaperButton>
                      ) : null}
                      <PaperButton
                        mode="contained"
                        style={styles.paperPrimaryButton}
                        buttonColor={activeTheme.primaryButton}
                        textColor={activeTheme.primaryButtonText}
                        onPress={() => openGovernanceDaoInDiscover(dao.daoId)}
                      >
                        Deposit
                      </PaperButton>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          {!assetsLoading && !governanceEligibilityLoading && governanceEligibility.length === 0 && !governanceEligibilityError ? (
            <Text style={styles.sectionHint}>
              {governanceEligibilityScanned
                ? 'No supported DAOs were found for the current community or council tokens in this wallet.'
                : 'Scan this wallet to find DAOs whose community or council token is already in your holdings.'}
            </Text>
          ) : null}
        </View>

        {governanceVoteResult ? (
          <View style={styles.successBox}>
            <Text style={styles.successBoxText}>Vote submitted. Signature {shortenAddress(governanceVoteResult.signature)}</Text>
          </View>
        ) : null}
        {governanceVoteError ? <Text style={styles.errorText}>{governanceVoteError}</Text> : null}
        {governanceLoading ? (
          <View style={styles.sectionCard}>
            <View style={styles.loadingRow}>
              <ActivityIndicator color={activeTheme.grape} />
              <Text style={styles.sectionHint}>Loading governance proposals...</Text>
            </View>
          </View>
        ) : null}
        {!governanceLoading && governanceError ? (
          <View style={styles.sectionCard}>
            <Text style={styles.errorText}>{governanceError}</Text>
          </View>
        ) : null}
        {!governanceLoading && !governanceError && governance.proposals.length === 0 ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>No active governance proposals</Text>
            <Text style={styles.sectionHint}>
              {totalGovernanceDaoCount > 0
                ? 'This wallet is part of tracked or discovered DAOs, but none currently have active proposals.'
                : 'No governance DAOs have been detected for this wallet yet.'}
            </Text>
          </View>
        ) : null}

        {!governanceLoading && !governanceError ? (() => {
          const nowUnixSeconds = Math.floor(Date.now() / 1000);
          const activeProposals = governance.proposals.filter((proposal) => {
            const timeMeta = getGovernanceProposalTimeMeta(proposal, nowUnixSeconds);
            return proposal.stateCode === 2 && timeMeta.votingWindowOpen;
          });
          const finalizingProposals = governance.proposals.filter((proposal) => {
            const timeMeta = getGovernanceProposalTimeMeta(proposal, nowUnixSeconds);
            return proposal.stateCode === 2 && !timeMeta.votingWindowOpen;
          });

          return (
            <>
              {activeProposals.map((proposal) => renderMobileGovernanceProposalCard(proposal, nowUnixSeconds))}
              {finalizingProposals.length > 0 ? (
                <View style={styles.sectionCard}>
                  <Pressable
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                    onPress={() => setGovernanceShowFinalizing((current) => !current)}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.sectionTitle}>Needs finalization</Text>
                      <Text style={styles.sectionHint}>
                        Voting has ended on {finalizingProposals.length} proposal{finalizingProposals.length === 1 ? '' : 's'}.
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={styles.governanceStatusPill}>
                        <Text style={styles.governanceStatusPillText}>{finalizingProposals.length}</Text>
                      </View>
                      <Feather name={governanceShowFinalizing ? 'chevron-down' : 'chevron-right'} size={18} color={activeTheme.muted} />
                    </View>
                  </Pressable>
                  {governanceShowFinalizing ? (
                    <View style={{ marginTop: 12, gap: 12 }}>
                      {finalizingProposals.map((proposal) => renderMobileGovernanceProposalCard(proposal, nowUnixSeconds))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </>
          );
        })() : null}
      </View>
    );
  }

  function renderSendTab() {
    const selectedSendAssetSubtitle = selectedSendAsset
      ? getAssetSubtitle(selectedSendAsset, selectedChainMeta.label, selectedChainMeta.short)
      : null;
    const nativeGasAsset =
      selectedWallet?.chain === 'solana'
        ? assets.find((asset) => asset.chain === 'solana' && asset.tokenType === 'native')
        : null;
    const nativeGasBalance = nativeGasAsset?.amountUi ?? 0;
    const sendAmountNumber = Number(sendAmount || '0');
    const gasWarning =
      selectedWallet?.chain !== 'solana' || !selectedSendAsset
        ? null
        : selectedSendAsset.tokenType === 'spl'
          ? nativeGasBalance < SOLANA_TOKEN_SEND_RESERVE_SOL
            ? 'This wallet may not have enough SOL for network fees and recipient token account creation.'
            : null
          : selectedSendAsset.tokenType === 'native' && Number.isFinite(sendAmountNumber) && sendAmountNumber > 0
            ? nativeGasBalance <= sendAmountNumber + SOLANA_SEND_FEE_RESERVE_SOL
              ? 'Leave some SOL in the wallet for network fees.'
              : null
            : null;

    return (
      <View style={styles.stack}>
        <View style={styles.sectionCard}>
          <Pressable style={styles.detailBackRow} onPress={() => setSendScreenVisible(false)}>
            <Feather name="chevron-left" size={18} color={activeTheme.text} />
            <Text style={styles.detailBackText}>Back to wallet</Text>
          </Pressable>

          <Text style={styles.sectionTitle}>Send asset</Text>
          <Text style={styles.sectionHint}>
            Choose what to send from {selectedWallet?.name ?? 'this wallet'}, then confirm the destination and amount.
          </Text>
        </View>

        <View style={[styles.sectionCard, styles.formCard]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Asset</Text>
            <Text style={styles.sectionHint}>{assets.length} available</Text>
          </View>
          <Pressable style={styles.sendAssetSelectButton} onPress={() => setSendAssetPickerVisible(true)}>
            {selectedSendAsset ? (
              <>
                <View style={styles.sendSelectedAssetGlyph}>
                  {renderAssetGlyph(selectedSendAsset, 44, styles.assetGlyphText, styles.assetGlyphImage)}
                </View>
                <View style={styles.sendSelectedAssetCopy}>
                  <Text style={styles.sendSelectedAssetName}>{selectedSendAsset.name}</Text>
                  <Text style={styles.sendSelectedAssetMeta}>
                    {selectedSendAssetSubtitle ?? selectedSendAsset.symbol}
                  </Text>
                </View>
                <View style={styles.assetValueStack}>
                  <Text style={styles.assetValue}>{maskValue(selectedSendAsset.amountLabel, walletState.privacyMode)}</Text>
                  <Text style={styles.assetValueMeta}>Tap to switch</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.sendSelectedAssetGlyph}>
                  <MaterialCommunityIcons name="swap-horizontal-circle-outline" size={26} color={activeTheme.text} />
                </View>
                <View style={styles.sendSelectedAssetCopy}>
                  <Text style={styles.sendSelectedAssetName}>Choose asset</Text>
                  <Text style={styles.sendSelectedAssetMeta}>Select what you want to send</Text>
                </View>
              </>
            )}
            <Feather name="chevron-down" size={18} color={activeTheme.muted} style={styles.rowChevronIcon} />
          </Pressable>
        </View>

        <View style={[styles.sectionCard, styles.formCard]}>
          <Text style={styles.sectionTitle}>Transfer details</Text>
          {selectedSendAsset ? (
            <View style={styles.sendSelectedAssetCard}>
              <View style={styles.sendSelectedAssetGlyph}>
                {renderAssetGlyph(selectedSendAsset, 44, styles.assetGlyphText, styles.assetGlyphImage)}
              </View>
              <View style={styles.sendSelectedAssetCopy}>
                <Text style={styles.sendSelectedAssetName}>{selectedSendAsset.name}</Text>
                <Text style={styles.sendSelectedAssetMeta}>
                  {selectedSendAssetSubtitle ?? selectedSendAsset.symbol}
                </Text>
              </View>
              <Text style={styles.sendSelectedAssetBalance}>
                {maskValue(selectedSendAsset.amountLabel, walletState.privacyMode)}
              </Text>
            </View>
          ) : null}
          <PaperTextInput
            value={sendRecipient}
            onChangeText={setSendRecipient}
            placeholder="Recipient"
            autoCapitalize="none"
            autoCorrect={false}
            mode="outlined"
            style={styles.paperInput}
            contentStyle={styles.paperInputContent}
            outlineStyle={styles.paperOutline}
            textColor={activeTheme.text}
            right={
              <PaperTextInput.Icon
                icon="qrcode-scan"
                forceTextInputFocus={false}
                onPress={() => void handleOpenQrScanner('send')}
              />
            }
          />
          <PaperTextInput
            value={sendAmount}
            onChangeText={setSendAmount}
            placeholder={selectedSendAsset ? `Amount in ${selectedSendAsset.symbol}` : 'Amount'}
            keyboardType="decimal-pad"
            mode="outlined"
            style={styles.paperInput}
            contentStyle={styles.paperInputContent}
            outlineStyle={styles.paperOutline}
            textColor={activeTheme.text}
          />
          {selectedWallet?.chain === 'sui' && selectedSendAsset?.tokenType === 'sui-coin' ? (
            <Text style={styles.sectionHint}>Sui fungible token send is not available on mobile yet. Native SUI only.</Text>
          ) : null}
          {gasWarning ? <Text style={styles.errorText}>{gasWarning}</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <PaperButton
            mode="contained"
            style={styles.paperPrimaryButton}
            buttonColor={activeTheme.primaryButton}
            textColor={activeTheme.primaryButtonText}
            disabled={sendLoading || !selectedWallet || !selectedSendAsset}
            onPress={() => void handleSend()}
          >
            {sendLoading ? 'Sending...' : `Send ${selectedSendAsset?.symbol ?? selectedChainMeta.short}`}
          </PaperButton>
        </View>
      </View>
    );
  }

  function renderRoutePicker(options: Array<{ id: string; label: string; meta: string; helper?: string }>, selectedId: string | null, onSelect: (id: string) => void) {
    return (
      <View style={styles.routePicker}>
        {options.map((option) => (
          <Pressable
            key={option.id}
            style={[styles.routeOption, selectedId === option.id ? styles.routeOptionActive : null]}
            onPress={() => onSelect(option.id)}
          >
            <Text style={styles.routeOptionLabel}>{option.label}</Text>
            <Text style={styles.routeOptionValue}>{option.meta}</Text>
            {option.helper ? <Text style={styles.routeOptionHelper}>{option.helper}</Text> : null}
          </Pressable>
        ))}
      </View>
    );
  }

  function renderSwapTab() {
    const selectedInputSubtitle = selectedSwapInputAsset
      ? getAssetSubtitle(selectedSwapInputAsset, selectedChainMeta.label, selectedChainMeta.short)
      : null;
    const selectedOutputSubtitle = selectedSwapOutputAsset
      ? getAssetSubtitle(selectedSwapOutputAsset, selectedChainMeta.label, selectedChainMeta.short)
      : null;
    const activeSwapRoute = swapQuote?.routes.find((route) => route.id === (swapSelectedRouteId ?? swapQuote.selectedRouteId)) ?? swapQuote?.routes[0] ?? null;
    const quoteOutputValue = activeSwapRoute ? `${activeSwapRoute.outputAmountUi} ${selectedSwapOutputAsset?.symbol ?? ''}`.trim() : '0';
    const availableInputAmount = selectedSwapInputAsset?.amountUi ?? 0;
    const swapRatioOptions = [0.25, 0.5, 0.75, 1] as const;

    return (
      <View style={styles.stack}>
        <View style={styles.sectionCard}>
          <Pressable style={styles.detailBackRow} onPress={() => setSwapScreenVisible(false)}>
            <Feather name="chevron-left" size={18} color={activeTheme.text} />
            <Text style={styles.detailBackText}>Back to wallet</Text>
          </Pressable>
          <Text style={styles.sectionTitle}>Swap</Text>
          <Text style={styles.sectionHint}>Review multiple Jupiter routes, then swap between assets held in this Solana wallet.</Text>
        </View>

        <View style={[styles.sectionCard, styles.swapFlowCard]}>
          <View style={styles.swapFlowShell}>
            <View style={styles.swapLeg}>
              <View style={styles.swapLegHeader}>
                <Text style={styles.swapLegLabel}>Sell</Text>
                <View style={styles.swapQuickRatios}>
                  {swapRatioOptions.map((ratio) => {
                    const disabled = availableInputAmount <= 0;
                    return (
                      <Pressable
                        key={ratio}
                        style={[styles.swapRatioChip, disabled ? styles.swapRatioChipDisabled : null]}
                        disabled={disabled}
                        onPress={() => setSwapAmountByRatio(ratio)}
                      >
                        <Text style={[styles.swapRatioChipText, disabled ? styles.swapRatioChipTextDisabled : null]}>
                          {ratio === 1 ? 'Max' : `${Math.round(ratio * 100)}%`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.swapLegMain}>
                <Pressable style={[styles.sendAssetSelectButton, styles.swapSelectShell]} onPress={() => setSwapInputPickerVisible(true)}>
                  {selectedSwapInputAsset ? (
                    <>
                      <View style={styles.sendSelectedAssetGlyph}>
                        {renderAssetGlyph(selectedSwapInputAsset, 44, styles.assetGlyphText, styles.assetGlyphImage)}
                      </View>
                      <View style={styles.sendSelectedAssetCopy}>
                        <Text style={styles.sendSelectedAssetName}>{selectedSwapInputAsset.name}</Text>
                        <Text style={styles.sendSelectedAssetMeta}>{selectedInputSubtitle ?? selectedSwapInputAsset.symbol}</Text>
                      </View>
                      <View style={styles.assetValueStack}>
                        <Text style={styles.assetValue}>{maskValue(selectedSwapInputAsset.amountLabel, walletState.privacyMode)}</Text>
                        <Text style={styles.assetValueMeta}>Tap to switch</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.sendSelectedAssetCopy}>
                      <Text style={styles.sendSelectedAssetName}>Choose input asset</Text>
                      <Text style={styles.sendSelectedAssetMeta}>Select what you want to sell</Text>
                    </View>
                  )}
                  <Feather name="chevron-down" size={18} color={activeTheme.muted} style={styles.rowChevronIcon} />
                </Pressable>

                <View style={styles.swapLegValueRow}>
                  <TextInput
                    value={swapAmount}
                    onChangeText={handleSwapAmountChange}
                    placeholder="0"
                    placeholderTextColor={activeTheme.muted}
                    keyboardType="decimal-pad"
                    style={styles.swapLegAmountInput}
                  />
                </View>
              </View>
            </View>

            <Pressable style={styles.swapFlipButton} onPress={handleFlipSwapDirection} disabled={!selectedSwapInputAsset || !selectedSwapOutputAsset}>
              <MaterialCommunityIcons name="swap-vertical" size={18} color={activeTheme.text} />
            </Pressable>

            <View style={styles.swapLeg}>
              <View style={styles.swapLegHeader}>
                <Text style={styles.swapLegLabel}>Buy</Text>
              </View>

              <View style={styles.swapLegMain}>
                <Pressable style={[styles.sendAssetSelectButton, styles.swapSelectShell]} onPress={() => setSwapOutputPickerVisible(true)}>
                  {selectedSwapOutputAsset ? (
                    <>
                      <View style={styles.sendSelectedAssetGlyph}>
                        {renderAssetGlyph(selectedSwapOutputAsset, 44, styles.assetGlyphText, styles.assetGlyphImage)}
                      </View>
                      <View style={styles.sendSelectedAssetCopy}>
                        <Text style={styles.sendSelectedAssetName}>{selectedSwapOutputAsset.name}</Text>
                        <Text style={styles.sendSelectedAssetMeta}>{selectedOutputSubtitle ?? selectedSwapOutputAsset.symbol}</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.sendSelectedAssetCopy}>
                      <Text style={styles.sendSelectedAssetName}>Choose output asset</Text>
                      <Text style={styles.sendSelectedAssetMeta}>Select what you want to receive</Text>
                    </View>
                  )}
                  <Feather name="chevron-down" size={18} color={activeTheme.muted} style={styles.rowChevronIcon} />
                </Pressable>

                <View style={styles.swapLegValueRow}>
                  <Text style={[styles.swapLegQuote, !swapQuote ? styles.swapLegQuotePending : null]}>
                    {swapQuote ? quoteOutputValue : selectedSwapOutputAsset?.symbol ? `0 ${selectedSwapOutputAsset.symbol}` : '0'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.swapSettingsRow}>
            <View style={styles.swapSlippageChip}>
              <Text style={styles.swapSlippageLabel}>Slippage</Text>
              <Text style={styles.swapSlippageValue}>{swapQuote?.slippageBps ?? MOBILE_SWAP_SLIPPAGE_BPS} bps</Text>
            </View>
          </View>

          {swapError ? (
            <View style={styles.inlineErrorCard}>
              <Text style={styles.errorText}>{swapError}</Text>
            </View>
          ) : null}

          <PaperButton
            mode="contained"
            style={styles.paperPrimaryButton}
            buttonColor={activeTheme.primaryButton}
            textColor={activeTheme.primaryButtonText}
            disabled={swapQuoteLoading || swapExecuteLoading || !selectedSwapInputAsset || !selectedSwapOutputAsset}
            onPress={() => void handleGetSwapQuote()}
          >
            {swapQuoteLoading ? 'Fetching routes...' : 'Get routes'}
          </PaperButton>
        </View>

        {swapQuote ? (
          <View style={[styles.sectionCard, styles.formCard]}>
            <Text style={styles.sectionTitle}>Quote</Text>
            <Text style={styles.sectionHint}>Pick the route you want Grape to execute.</Text>
            {swapQuote.routes.length > 1 ? (
              <View style={styles.swapRoutePicker}>
                {swapQuote.routes.map((route) => {
                  const active = route.id === (swapSelectedRouteId ?? swapQuote.selectedRouteId);
                  return (
                    <Pressable
                      key={route.id}
                      style={[styles.swapRouteOption, active ? styles.swapRouteOptionActive : null]}
                      onPress={() => setSwapSelectedRouteId(route.id)}
                    >
                      <View style={styles.swapRouteOptionCopy}>
                        <Text style={styles.swapRouteOptionTitle}>{route.label}</Text>
                        <Text style={styles.swapRouteOptionSubtitle}>
                          {route.routeLabels.length > 0 ? route.routeLabels.join(' -> ') : 'Jupiter route'}
                        </Text>
                      </View>
                      <View style={styles.swapRouteOptionMeta}>
                        <Text style={styles.swapRouteOptionValue}>{route.outputAmountUi}</Text>
                        <Text style={styles.swapRouteOptionImpact}>{route.priceImpactPct ?? 'Impact n/a'}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            <View style={styles.swapSummaryCard}>
              <View style={styles.swapSummaryRow}>
                <Text style={styles.swapSummaryLabel}>Estimated output</Text>
                <Text style={styles.swapSummaryValue}>{quoteOutputValue}</Text>
              </View>
              <View style={styles.swapSummaryRow}>
                <Text style={styles.swapSummaryLabel}>Slippage</Text>
                <Text style={styles.swapSummaryValue}>{swapQuote.slippageBps} bps</Text>
              </View>
              <View style={styles.swapSummaryRow}>
                <Text style={styles.swapSummaryLabel}>Price impact</Text>
                <Text style={styles.swapSummaryValue}>{activeSwapRoute?.priceImpactPct ?? 'Unavailable'}</Text>
              </View>
              <View style={styles.swapSummaryRow}>
                <Text style={styles.swapSummaryLabel}>Route</Text>
                <Text style={styles.swapSummaryValue}>
                  {activeSwapRoute?.routeLabels.length ? activeSwapRoute.routeLabels.join(' -> ') : 'Jupiter route'}
                </Text>
              </View>
            </View>
            <PaperButton
              mode="contained"
              style={styles.paperPrimaryButton}
              buttonColor={activeTheme.primaryButton}
              textColor={activeTheme.primaryButtonText}
              disabled={swapExecuteLoading}
              onPress={() => void handleExecuteSwap()}
            >
              {swapExecuteLoading ? 'Submitting swap...' : `Swap ${selectedSwapInputAsset?.symbol ?? ''}`}
            </PaperButton>
          </View>
        ) : null}
      </View>
    );
  }

  function renderBridgeTab() {
    const routeOptions = (bridgeQuote?.routes ?? []).map((route) => ({
      id: route.id,
      label: route.label,
      meta: `${route.toAmountUi} ${route.toSymbol}`.trim(),
      helper: route.routeLabels.length > 0 ? route.routeLabels.join(' · ') : route.feeUsd ? `${route.feeUsd} fee` : undefined
    }));

    return (
      <View style={styles.stack}>
        <View style={styles.sectionCard}>
          <Pressable style={styles.detailBackRow} onPress={() => setBridgeScreenVisible(false)}>
            <Feather name="chevron-left" size={18} color={activeTheme.text} />
            <Text style={styles.detailBackText}>Back to wallet</Text>
          </Pressable>
          <Text style={styles.sectionTitle}>Bridge</Text>
          <Text style={styles.sectionHint}>Move a native asset from this wallet to another chain wallet you already manage in Grape.</Text>
        </View>

        <View style={[styles.sectionCard, styles.formCard]}>
          <Text style={styles.sectionTitle}>Destination chain</Text>
          <SegmentedButtons
            value={bridgeToChain}
            onValueChange={(value) => {
              setBridgeToChain(value as MobileWalletState['selectedChain']);
              setBridgeQuote(null);
              setBridgeSelectedRouteId(null);
              setBridgeError(null);
            }}
            buttons={bridgeDestinationChains.map((chain) => ({ value: chain, label: chainMeta(chain).short }))}
            style={styles.paperSegments}
            density="small"
          />

          <Text style={styles.sectionTitle}>Destination wallet</Text>
          <View style={styles.stack}>
            {bridgeDestinationWallets.length === 0 ? (
              <Text style={styles.sectionHint}>Add a {chainMeta(bridgeToChain).label} wallet before bridging there.</Text>
            ) : (
              bridgeDestinationWallets.map((wallet) => {
                const active = wallet.id === selectedBridgeDestinationWallet?.id;
                return (
                  <Pressable
                    key={wallet.id}
                    style={[styles.walletRow, active ? styles.walletRowActive : null]}
                    onPress={() => {
                      setBridgeDestinationWalletId(wallet.id);
                      setBridgeQuote(null);
                      setBridgeSelectedRouteId(null);
                    }}
                  >
                    <View style={styles.walletCopy}>
                      <Text style={styles.walletName}>{wallet.name}</Text>
                      <Text style={styles.walletMeta}>{shortenAddress(wallet.address)}</Text>
                    </View>
                    {active ? <Feather name="check" size={18} color={activeTheme.text} style={styles.rowCheckIcon} /> : null}
                  </Pressable>
                );
              })
            )}
          </View>

          <PaperTextInput
            value={bridgeAmount}
            onChangeText={setBridgeAmount}
            placeholder={selectedWallet ? `Amount in ${selectedWallet.chain === 'solana' ? 'SOL' : selectedWallet.chain === 'ethereum' ? 'ETH' : selectedWallet.chain === 'monad' ? 'MON' : 'asset'}` : 'Amount'}
            keyboardType="decimal-pad"
            mode="outlined"
            style={styles.paperInput}
            contentStyle={styles.paperInputContent}
            outlineStyle={styles.paperOutline}
            textColor={activeTheme.text}
          />
          {bridgeError ? <Text style={styles.errorText}>{bridgeError}</Text> : null}
          <PaperButton
            mode="contained"
            style={styles.paperPrimaryButton}
            buttonColor={activeTheme.primaryButton}
            textColor={activeTheme.primaryButtonText}
            disabled={bridgeQuoteLoading || bridgeExecuteLoading || !selectedBridgeDestinationWallet}
            onPress={() => void handleGetBridgeQuote()}
          >
            {bridgeQuoteLoading ? 'Fetching routes...' : 'Get routes'}
          </PaperButton>
        </View>

        {bridgeQuote ? (
          <View style={[styles.sectionCard, styles.formCard]}>
            <Text style={styles.sectionTitle}>Routes</Text>
            <Text style={styles.sectionHint}>Pick the bridge route you want Grape to use.</Text>
            {renderRoutePicker(routeOptions, bridgeSelectedRouteId, setBridgeSelectedRouteId)}
            <PaperButton
              mode="contained"
              style={styles.paperPrimaryButton}
              buttonColor={activeTheme.primaryButton}
              textColor={activeTheme.primaryButtonText}
              disabled={bridgeExecuteLoading}
              onPress={() => void handleExecuteBridge()}
            >
              {bridgeExecuteLoading ? 'Submitting bridge...' : 'Bridge now'}
            </PaperButton>
          </View>
        ) : null}
      </View>
    );
  }

  function renderActivityRow(activity: MobileActivity) {
    const isFailed = activity.status === 'failed';
    const isSuccess = activity.status === 'success';
    const statusLabel = isFailed ? 'Failed' : isSuccess ? 'Success' : 'Pending';
    const glyphName =
      activity.type.includes('send') || activity.type.includes('transfer')
        ? 'arrow-top-right'
        : activity.type.includes('swap')
          ? 'swap-horizontal'
          : activity.type.includes('stake')
            ? 'archive-arrow-up'
            : 'clock-outline';

    return (
      <View key={activity.id} style={styles.activityRow}>
        <View style={styles.activityGlyph}>
          <MaterialCommunityIcons name={glyphName as never} size={20} color={activeTheme.text} />
        </View>
        <View style={styles.activityCopy}>
          <Text style={styles.activityName}>{activity.title}</Text>
          <Text style={styles.activityMeta}>{activity.amountLabel} · {activity.subtitle}</Text>
          <Text style={styles.activityMeta}>{formatActivityTime(activity.timestamp)}</Text>
        </View>
        <View style={styles.activityStatus}>
          <Text style={styles.activityStatusText}>{statusLabel}</Text>
        </View>
      </View>
    );
  }

  function renderActivityTab() {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Activity</Text>
          <Text style={styles.sectionHint}>{filteredActivity.length} item{filteredActivity.length === 1 ? '' : 's'}</Text>
        </View>
        <View style={styles.stack}>
          {filteredActivity.length === 0 ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>No activity yet</Text>
              <Text style={styles.sectionHint}>
                {activityLoading
                  ? 'Loading recent activity...'
                  : 'Recent wallet activity will appear here once the chain index catches up.'}
              </Text>
            </View>
          ) : (
            filteredActivity.map(renderActivityRow)
          )}
        </View>
      </View>
    );
  }

  function renderSettingsTab() {
    const selectedThemeLabel = mobileThemes.find((theme) => theme.id === walletState.selectedTheme)?.label ?? 'Theme';
    const verificationTrackedCount = walletState.trackedVerificationSpaceIds.length;
    const reputationTrackedCount = walletState.trackedReputationSpaceIds.length;
    const governanceTrackedCount = walletState.trackedGovernanceDaoIds.length;
    const trustedAppsCount = walletState.trustedDappOrigins.length;
    const participatingDaoCount = new Set([
      ...governance.discoveredDaos,
      ...governance.daos.map((dao) => dao.daoId),
      ...walletState.trackedGovernanceDaoIds
    ]).size;

    const toggleSettingsSection = (section: string) => {
      setExpandedSettingsSections((previous) => {
        const next = new Set(previous);
        if (next.has(section)) {
          next.delete(section);
        } else {
          next.add(section);
        }
        return next;
      });
    };

    const renderSettingsSection = (key: string, title: string, summary: string, children: any) => {
      const expanded = expandedSettingsSections.has(key);

      return (
        <View style={styles.sectionCard}>
          <Pressable style={styles.settingsSectionToggle} onPress={() => toggleSettingsSection(key)}>
            <View style={styles.settingsSectionToggleCopy}>
              <Text style={styles.sectionTitle}>{title}</Text>
              <Text style={styles.settingsSectionSummary}>{summary}</Text>
            </View>
            <Feather name={expanded ? 'chevron-down' : 'chevron-right'} size={18} color={activeTheme.muted} />
          </Pressable>
          {expanded ? children : null}
        </View>
      );
    };

    const renderSettingsGroupHeading = (eyebrow: string, title: string, summary: string) => (
      <View style={styles.settingsGroupHeading}>
        <Text style={styles.settingsGroupEyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionHint}>{summary}</Text>
      </View>
    );

    return (
      <View style={styles.stack}>
        {renderSettingsGroupHeading('Wallet', 'Wallet & appearance', 'Theme, privacy, biometric unlock, and the currently selected wallet.')}

        {renderSettingsSection(
          'appearance',
          'Appearance',
          selectedThemeLabel,
          <>
            <Text style={styles.sectionHint}>Match the same visual families and background graphics as the extension.</Text>
            <View style={styles.themeGrid}>
              {mobileThemes.map((theme) => {
                const selected = walletState.selectedTheme === theme.id;
                return (
                  <Pressable
                    key={theme.id}
                    style={[styles.themeChip, selected ? styles.themeChipActive : null]}
                    onPress={() => void handleSetTheme(theme.id)}
                  >
                    <Text style={[styles.themeChipText, selected ? styles.themeChipTextActive : null]}>{theme.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {renderSettingsSection(
          'privacy',
          'Privacy & unlock',
          `${walletState.privacyMode ? 'Privacy on' : 'Privacy off'} • ${
            biometricAvailable
              ? walletState.biometricEnabled
                ? 'Biometric on'
                : 'Biometric off'
              : 'Biometric unavailable'
          }`,
          <>
            <View style={styles.settingsRow}>
              <View style={styles.settingsCopy}>
                <Text style={styles.settingsTitle}>Privacy mode</Text>
                <Text style={styles.sectionHint}>Hide balances and wallet values on screen.</Text>
              </View>
              <Switch
                value={walletState.privacyMode}
                onValueChange={(value) => void handleSetPrivacyMode(value)}
                trackColor={{ true: activeTheme.primaryButton, false: 'rgba(255,255,255,0.16)' }}
                thumbColor={walletState.privacyMode ? '#f7f2ff' : '#d0c0df'}
              />
            </View>
            <View style={styles.settingsRow}>
              <View style={styles.settingsCopy}>
                <Text style={styles.settingsTitle}>Biometric unlock</Text>
                <Text style={styles.sectionHint}>
                  {biometricAvailable ? 'Unlock the wallet with your device biometric if available.' : 'Biometric unlock is not available on this device.'}
                </Text>
              </View>
              <Switch
                value={walletState.biometricEnabled}
                onValueChange={(value) => void handleSetBiometricEnabled(value)}
                disabled={!biometricAvailable}
                trackColor={{ true: activeTheme.primaryButton, false: 'rgba(255,255,255,0.16)' }}
                thumbColor={walletState.biometricEnabled ? '#f7f2ff' : '#d0c0df'}
              />
            </View>
          </>
        )}

        {renderSettingsSection(
          'current-wallet',
          'Current wallet',
          `${selectedWallet?.name ?? '--'} • ${selectedChainMeta.label}`,
          <Text style={styles.settingsMono}>{selectedWallet?.address ?? '--'}</Text>
        )}

        {renderSettingsGroupHeading('Recovery', 'Security & recovery', 'Export, device linking, and trusted app access.')}

        {renderSettingsSection(
          'backup',
          'Backup & export',
          exportedPrivateKey && exportVerifiedWalletId === selectedWallet?.id ? 'Verified for export' : 'Private key export',
          <>
            <Text style={styles.sectionHint}>
              Export the current wallet private key only if you have a secure destination. A successful passkey, password, or biometric check reveals it immediately.
            </Text>
          {walletState.passkeyWallet ? (
            <Text style={styles.sectionHint}>This wallet set uses a deterministic passkey instead of a user-entered password on this device.</Text>
          ) : (
            <PaperTextInput
              value={exportPassword}
              onChangeText={setExportPassword}
              placeholder="Password"
              secureTextEntry
              mode="outlined"
              style={styles.paperInput}
              contentStyle={styles.paperInputContent}
              outlineStyle={styles.paperOutline}
              textColor={activeTheme.text}
              right={
                walletState.biometricEnabled && biometricAvailable ? (
                  <PaperTextInput.Icon
                    icon="fingerprint"
                    onPress={() => void handleBiometricVerifyExport()}
                    disabled={exportLoading || biometricLoading || !selectedWallet}
                    forceTextInputFocus={false}
                  />
                ) : undefined
              }
            />
          )}
          <View style={styles.walletToolsRow}>
            <PaperButton
              mode="contained"
              style={[styles.paperPrimaryButton, styles.walletToolButton]}
              buttonColor={activeTheme.primaryButton}
              textColor={activeTheme.primaryButtonText}
              disabled={exportLoading || !selectedWallet || (walletState.passkeyWallet ? !passkeyAvailable : !exportPassword.trim())}
              onPress={() => void (walletState.passkeyWallet ? handleVerifyExportWithPasskey() : handleVerifyExportPassword())}
            >
              {exportLoading ? 'Checking...' : walletState.passkeyWallet ? 'Reveal with passkey' : 'Reveal with password'}
            </PaperButton>
            {walletState.passkeyWallet && walletState.biometricEnabled && biometricAvailable ? (
              <PaperButton
                mode="outlined"
                style={[styles.paperSecondaryButton, styles.walletToolButton]}
                disabled={exportLoading || biometricLoading || !selectedWallet}
                onPress={() => void handleBiometricVerifyExport()}
              >
                Verify with device
              </PaperButton>
            ) : null}
            <PaperButton
              mode="outlined"
              style={[styles.paperSecondaryButton, styles.walletToolButton]}
              disabled={!exportedPrivateKey || exportVerifiedWalletId !== selectedWallet?.id}
              onPress={() => setExportReveal((value) => !value)}
            >
              {exportReveal ? 'Hide key' : 'Show key'}
            </PaperButton>
          </View>
          <View style={styles.exportSecretCard}>
            <Text style={styles.exportSecretLabel}>Private key</Text>
            <Text style={styles.settingsMono}>
              {exportedPrivateKey && exportReveal && exportVerifiedWalletId === selectedWallet?.id
                ? exportedPrivateKey
                : '••••••••••••••••••••••••••••••••'}
            </Text>
          </View>
          </>
        )}

        {renderSettingsSection(
          'link-device',
          'Link new device',
          deviceLinkSession ? `Active link • expires ${new Date(deviceLinkSession.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'No active device link',
          <>
            <Text style={styles.sectionHint}>
              Create a short-lived restore QR for another Grape device. The QR payload is encrypted, and the pairing code is required to unlock it.
            </Text>
          <View style={styles.walletToolsRow}>
            <PaperButton
              mode="contained"
              style={[styles.paperPrimaryButton, styles.walletToolButton]}
              buttonColor={activeTheme.primaryButton}
              textColor={activeTheme.primaryButtonText}
              disabled={deviceLinkLoading || !selectedWallet || (walletState.passkeyWallet ? !passkeyAvailable : !exportPassword.trim())}
              onPress={() => void (walletState.passkeyWallet ? handleCreateDeviceLinkWithPasskey() : handleCreateDeviceLinkWithPassword())}
            >
              {deviceLinkLoading ? 'Creating...' : walletState.passkeyWallet ? 'Link with passkey' : 'Link with password'}
            </PaperButton>
            {walletState.biometricEnabled && biometricAvailable ? (
              <PaperButton
                mode="outlined"
                style={[styles.paperSecondaryButton, styles.walletToolButton]}
                disabled={deviceLinkLoading || biometricLoading || !selectedWallet}
                onPress={() => void handleCreateDeviceLinkWithBiometric()}
              >
                Verify with device
              </PaperButton>
            ) : null}
          </View>
          {deviceLinkSession ? (
            <View style={styles.stack}>
              <View style={styles.qrCard}>
                <View style={[styles.qrSurface, { width: deviceLinkQrSize + 32, height: deviceLinkQrSize + 32 }]}>
                  <QRCode
                    value={deviceLinkSession.qrPayload}
                    size={deviceLinkQrSize}
                    color="#101114"
                    backgroundColor="#ffffff"
                  />
                </View>
              </View>
              <View style={styles.exportSecretCard}>
                <Text style={styles.exportSecretLabel}>Pairing code</Text>
                <Text style={styles.settingsMono}>{deviceLinkSession.pairingCode}</Text>
              </View>
              <Text style={styles.sectionHint}>Expires {new Date(deviceLinkSession.expiresAt).toLocaleString()}</Text>
              <PaperButton
                mode="outlined"
                style={styles.paperSecondaryButton}
                onPress={() => void handleShareDeviceLink()}
              >
                Share restore payload
              </PaperButton>
            </View>
          ) : null}
          </>
        )}

        {renderSettingsSection(
          'trusted-apps',
          'Trusted apps',
          trustedAppsCount > 0 ? `${trustedAppsCount} trusted` : 'No trusted apps',
          <>
            <Text style={styles.sectionHint}>
              Grape Discover remembers sites you approved for connection. Remove any site to force a new connect prompt.
            </Text>
          {walletState.trustedDappOrigins.length === 0 ? (
            <Text style={styles.sectionHint}>No trusted apps yet.</Text>
          ) : (
            <View style={styles.stack}>
              {walletState.trustedDappOrigins.map((origin) => (
                <View key={origin} style={styles.discoverTrustedOriginRow}>
                  <Text style={styles.discoverTrustedOriginText}>{origin}</Text>
                  <PaperButton
                    mode="outlined"
                    style={styles.paperSecondaryButton}
                    onPress={() => void forgetTrustedDappOrigin(origin)}
                  >
                    Remove
                  </PaperButton>
                </View>
              ))}
            </View>
          )}
          </>
        )}

        {renderSettingsGroupHeading('Community', 'Community & tracking', 'Verification, governance, and OG reputation spaces for this wallet.')}

        {renderSettingsSection(
          'verification',
          'Verification Spaces',
          verificationTrackedCount > 0 ? `${verificationTrackedCount} tracked` : 'No spaces tracked',
          <>
            <Text style={styles.sectionHint}>
              Add the DAO ids you want to verify against. Mobile opens Grape Verification directly for tracked spaces.
            </Text>
          <PaperTextInput
            value={verificationSpaceInput}
            onChangeText={setVerificationSpaceInput}
            placeholder="Add Solana verification DAO id"
            mode="outlined"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.paperInput}
            contentStyle={styles.paperInputContent}
            outlineStyle={styles.paperOutline}
            textColor={activeTheme.text}
          />
          <PaperButton
            mode="contained"
            style={styles.paperPrimaryButton}
            buttonColor={activeTheme.primaryButton}
            textColor={activeTheme.primaryButtonText}
            disabled={verificationSaving || !verificationSpaceInput.trim()}
            onPress={() => void handleAddVerificationSpace()}
          >
            {verificationSaving ? 'Saving...' : 'Add verification space'}
          </PaperButton>
          {verificationError ? <Text style={styles.errorText}>{verificationError}</Text> : null}
          {walletState.trackedVerificationSpaceIds.length === 0 ? (
            <Text style={styles.sectionHint}>No verification spaces tracked yet.</Text>
          ) : (
            <View style={styles.stack}>
              {walletState.trackedVerificationSpaceIds.map((daoId) => (
                <View key={daoId} style={styles.reputationSpaceRow}>
                  <View style={styles.reputationSpaceCopy}>
                    <Text style={styles.reputationSpaceTitle}>{shortenAddress(daoId)}</Text>
                    <Text style={styles.reputationSpaceMono}>{daoId}</Text>
                  </View>
                  <View style={styles.reputationSpaceActions}>
                    <Pressable
                      style={styles.reputationOpenButton}
                      onPress={() => void openVerificationSpace(daoId)}
                    >
                      <Feather name="external-link" size={16} color={activeTheme.text} />
                    </Pressable>
                    <Pressable
                      style={styles.reputationRemoveButton}
                      onPress={() => void handleRemoveVerificationSpace(daoId)}
                    >
                      <Feather name="trash-2" size={16} color={activeTheme.danger} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
          </>
        )}

        {renderSettingsSection(
          'governance',
          'Governance DAOs',
          participatingDaoCount > 0 ? `${participatingDaoCount} participating • ${governanceTrackedCount} tracked` : governanceTrackedCount > 0 ? `${governanceTrackedCount} tracked` : 'No DAOs tracked',
          <>
            <Text style={styles.sectionHint}>
              Grape auto-detects the Solana DAOs this wallet participates in from governance membership records. You can also track extra realm ids here.
            </Text>
          {selectedWallet?.chain !== 'solana' ? (
            <Text style={styles.sectionHint}>Governance proposal tracking is currently supported for Solana wallets.</Text>
          ) : (
            <>
              <Text style={styles.settingsTitle}>Auto-detected</Text>
              {governance.discoveredDaos.length > 0 ? (
                <View style={styles.stack}>
                  {governance.discoveredDaos.map((daoId) => (
                    <View key={daoId} style={styles.reputationSpaceRow}>
                      <View style={styles.reputationSpaceCopy}>
                        <Text style={styles.reputationSpaceTitle}>{shortenAddress(daoId)}</Text>
                        <Text style={styles.reputationSpaceMono}>{daoId}</Text>
                      </View>
                      <View style={styles.activePill}>
                        <Text style={styles.activePillText}>Detected</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.sectionHint}>No governance DAOs have been auto-detected for this wallet yet.</Text>
              )}

              <PaperTextInput
                value={governanceDaoInput}
                onChangeText={setGovernanceDaoInput}
                placeholder="Track an extra governance DAO realm id"
                mode="outlined"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.paperInput}
                contentStyle={styles.paperInputContent}
                outlineStyle={styles.paperOutline}
                textColor={activeTheme.text}
              />
              <PaperButton
                mode="contained"
                style={styles.paperPrimaryButton}
                buttonColor={activeTheme.primaryButton}
                textColor={activeTheme.primaryButtonText}
                disabled={governanceSaving || !governanceDaoInput.trim()}
                onPress={() => void handleAddGovernanceDao()}
              >
                {governanceSaving ? 'Saving...' : 'Add tracked DAO'}
              </PaperButton>
              {walletState.trackedGovernanceDaoIds.length > 0 ? (
                <View style={styles.stack}>
                  {walletState.trackedGovernanceDaoIds.map((daoId) => (
                    <View key={daoId} style={styles.reputationSpaceRow}>
                      <View style={styles.reputationSpaceCopy}>
                        <Text style={styles.reputationSpaceTitle}>{shortenAddress(daoId)}</Text>
                        <Text style={styles.reputationSpaceMono}>{daoId}</Text>
                      </View>
                      <Pressable
                        style={styles.reputationRemoveButton}
                        onPress={() => void handleRemoveGovernanceDao(daoId)}
                      >
                        <Feather name="trash-2" size={16} color={activeTheme.danger} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.sectionHint}>No extra governance DAOs are being tracked.</Text>
              )}
              {governanceError ? <Text style={styles.errorText}>{governanceError}</Text> : null}
            </>
          )}
          </>
        )}

        {renderSettingsSection(
          'reputation',
          'OG Reputation Spaces',
          reputationTrackedCount > 0 ? `${reputationTrackedCount} tracked` : 'No spaces tracked',
          <>
            <Text style={styles.sectionHint}>
              Track Solana OG reputation by adding DAO space ids here. Home will then show the current wallet’s effective points per tracked space.
            </Text>
          <PaperTextInput
            value={reputationSpaceInput}
            onChangeText={setReputationSpaceInput}
            placeholder="Add Solana DAO space id"
            mode="outlined"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.paperInput}
            contentStyle={styles.paperInputContent}
            outlineStyle={styles.paperOutline}
            textColor={activeTheme.text}
          />
          <PaperButton
            mode="contained"
            style={styles.paperPrimaryButton}
            buttonColor={activeTheme.primaryButton}
            textColor={activeTheme.primaryButtonText}
            disabled={reputationSaving || !reputationSpaceInput.trim()}
            onPress={() => void handleAddReputationSpace()}
          >
            {reputationSaving ? 'Saving...' : 'Add reputation space'}
          </PaperButton>
          {reputationError ? <Text style={styles.errorText}>{reputationError}</Text> : null}
          {walletState.trackedReputationSpaceIds.length === 0 ? (
            <Text style={styles.sectionHint}>No tracked spaces yet.</Text>
          ) : (
            <View style={styles.stack}>
              {walletState.trackedReputationSpaceIds.map((daoId) => (
                <View key={daoId} style={styles.reputationSpaceRow}>
                  <View style={styles.reputationSpaceCopy}>
                    <Text style={styles.reputationSpaceTitle}>{shortenAddress(daoId)}</Text>
                    <Text style={styles.reputationSpaceMono}>{daoId}</Text>
                  </View>
                  <View style={styles.reputationSpaceActions}>
                    <Pressable
                      style={styles.reputationOpenButton}
                      onPress={() => void openOgReputationSpace(daoId)}
                    >
                      <Feather name="external-link" size={16} color={activeTheme.text} />
                    </Pressable>
                    <Pressable
                      style={styles.reputationRemoveButton}
                      onPress={() => void handleRemoveReputationSpace(daoId)}
                    >
                      <Feather name="trash-2" size={16} color={activeTheme.danger} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
          </>
        )}

        {renderSettingsGroupHeading('Manage', 'Wallet manager', 'Create, import, switch, remove, and lock wallets on this device.')}

        {renderSettingsSection(
          'all-wallets',
          'All wallets',
          `${walletState.wallets.length} wallet${walletState.wallets.length === 1 ? '' : 's'}`,
          <>
          <Pressable style={styles.sectionHeader} onPress={() => setWalletListExpanded((value) => !value)}>
            <Text style={styles.settingsTitle}>Wallet manager</Text>
            <Text style={styles.sectionHint}>{walletListExpanded ? 'Hide' : 'Show'}</Text>
          </Pressable>

          <View style={[styles.setupOptionStack, styles.formWalletToolsStack]}>
            <Pressable
              style={[styles.setupOptionCard, setupMode === 'create' && walletComposerVisible ? styles.setupOptionCardActive : null]}
              onPress={() => {
                setSetupMode('create');
                setConfirmBackedUp(false);
                setConfirmPasskeyOnlyAccess(false);
                setWalletComposerVisible((value) => !value || setupMode !== 'create');
              }}
            >
              <Text style={[styles.setupOptionTitle, setupMode === 'create' && walletComposerVisible ? styles.setupOptionTitleActive : null]}>
                Create wallet
              </Text>
              <Text style={styles.setupOptionMeta}>Generate a fresh recovery phrase for a new wallet set.</Text>
            </Pressable>
            <Pressable
              style={[styles.setupOptionCard, setupMode === 'import' && walletComposerVisible ? styles.setupOptionCardActive : null]}
              onPress={() => {
                setSetupMode('import');
                setConfirmBackedUp(false);
                setConfirmPasskeyOnlyAccess(false);
                setWalletComposerVisible((value) => !value || setupMode !== 'import');
              }}
            >
              <Text style={[styles.setupOptionTitle, setupMode === 'import' && walletComposerVisible ? styles.setupOptionTitleActive : null]}>
                Import wallet
              </Text>
              <Text style={styles.setupOptionMeta}>Add an existing phrase, private key, or Restore from Grape handoff.</Text>
            </Pressable>
          </View>

          {walletComposerVisible ? (
            <View style={[styles.sectionCard, styles.formCard]}>
              <Text style={styles.sectionTitle}>
                {setupMode === 'create' ? 'Create wallet' : setupMode === 'passkey' ? 'Create with passkey' : 'Import wallet'}
              </Text>
              <Text style={styles.sectionHint}>
                {setupMode === 'create'
                  ? 'Create another wallet set from a fresh 12-word or 24-word recovery phrase.'
                  : setupMode === 'passkey'
                    ? 'Deterministic passkey wallet creation is only available when starting a fresh wallet set.'
                  : 'Add another wallet using a recovery phrase or private key.'}
              </Text>

              {setupMode === 'create' ? (
                <>
                  <SegmentedButtons
                    value={String(mnemonicLength)}
                    onValueChange={(value) => setMnemonicLength(Number(value) as WalletMnemonicLength)}
                    buttons={[
                      { value: '12', label: '12 words' },
                      { value: '24', label: '24 words' }
                    ]}
                    style={styles.paperSegments}
                    density="small"
                  />
                  <View style={[styles.mnemonicCard, styles.formMnemonicCard]}>{renderMnemonicPills(generatedMnemonic)}</View>
                  <Pressable style={styles.checkboxRow} onPress={() => setConfirmBackedUp((value) => !value)}>
                    <Checkbox status={confirmBackedUp ? 'checked' : 'unchecked'} color={activeTheme.grape} />
                    <Text style={styles.checkboxLabel}>I saved this phrase securely.</Text>
                  </Pressable>
                </>
              ) : setupMode === 'passkey' ? (
                <>
                  <Text style={styles.sectionHint}>
                    Deterministic passkey wallet creation is only available when starting a fresh wallet set.
                  </Text>
                  {!passkeyAvailable && passkeyUnavailableMessage ? <Text style={styles.errorText}>{passkeyUnavailableMessage}</Text> : null}
                  {renderPasskeyRecoveryChoices()}
                  {passkeyRecoveryMode === 'passkey-only' ? (
                    <Pressable style={styles.checkboxRow} onPress={() => setConfirmPasskeyOnlyAccess((value) => !value)}>
                      <Checkbox status={confirmPasskeyOnlyAccess ? 'checked' : 'unchecked'} color={activeTheme.grape} />
                      <Text style={styles.checkboxLabel}>I understand that losing this passkey may permanently lock me out of this wallet.</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.sectionHint}>Choose passkey only to continue.</Text>
                  )}
                </>
              ) : (
                <>
                  <View style={styles.formChoiceRow}>
                    <Text style={styles.formChoiceLabel}>Import with</Text>
                    <SegmentedButtons
                      value={importKind}
                      onValueChange={(value) => setImportKind(value as ImportKind)}
                      buttons={[
                        { value: 'mnemonic', label: 'Recovery phrase' },
                        { value: 'private-key', label: 'Private key' },
                        { value: 'restore', label: 'Restore from Grape' }
                      ]}
                      style={styles.paperSegments}
                      density="small"
                    />
                  </View>
                  {importKind === 'mnemonic' ? (
                    <PaperTextInput
                      value={importMnemonic}
                      onChangeText={setImportMnemonic}
                      placeholder="Paste 12 or 24-word recovery phrase"
                      mode="outlined"
                      multiline
                      style={styles.paperInput}
                      contentStyle={[styles.paperInputContent, styles.paperTextAreaContent]}
                      outlineStyle={styles.paperOutline}
                      textColor={activeTheme.text}
                    />
                  ) : importKind === 'private-key' ? (
                    <>
                      <SegmentedButtons
                        value={importPrivateKeyChain}
                        onValueChange={(value) => setImportPrivateKeyChain(value as MobileWalletState['selectedChain'])}
                        buttons={chains.map((item) => ({ value: item.id, label: item.short }))}
                        style={styles.paperSegments}
                        density="small"
                      />
                      <PaperTextInput
                        value={importPrivateKey}
                        onChangeText={setImportPrivateKey}
                        placeholder={`Paste ${chainMeta(importPrivateKeyChain).label} private key`}
                        mode="outlined"
                        multiline
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={styles.paperInput}
                        contentStyle={[styles.paperInputContent, styles.paperTextAreaContent]}
                        outlineStyle={styles.paperOutline}
                        textColor={activeTheme.text}
                      />
                    </>
                  ) : (
                    <>
                      <Text style={styles.sectionHint}>Scan the QR from another Grape device or paste the restore payload manually.</Text>
                      <View style={styles.walletToolsRow}>
                        <PaperButton
                          mode="outlined"
                          style={[styles.paperSecondaryButton, styles.walletToolButton]}
                          onPress={() => void handleOpenQrScanner('restore')}
                        >
                          Scan QR
                        </PaperButton>
                      </View>
                      <PaperTextInput
                        value={restorePayload}
                        onChangeText={(value) => setRestorePayload(normalizeScannedRestorePayloadInput(value))}
                        placeholder="Paste restore payload"
                        mode="outlined"
                        multiline
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={styles.paperInput}
                        contentStyle={[styles.paperInputContent, styles.paperTextAreaContent]}
                        outlineStyle={styles.paperOutline}
                        textColor={activeTheme.text}
                      />
                      {parsedRestorePayload ? (
                        <View style={styles.exportSecretCard}>
                          <Text style={styles.exportSecretLabel}>{parsedRestorePayload.walletName}</Text>
                          <Text style={styles.sectionHint}>
                            {chainMeta(parsedRestorePayload.chain).label} · {formatShortAddress(parsedRestorePayload.publicKey)}
                          </Text>
                          <Text style={styles.sectionHint}>Expires {new Date(parsedRestorePayload.expiresAt).toLocaleString()}</Text>
                        </View>
                      ) : restorePayload.trim() ? (
                        <Text style={styles.sectionHint}>The restore payload could not be parsed yet. Scan again or copy it again from the existing Grape device.</Text>
                      ) : null}
                      <PaperTextInput
                        value={restorePairingCode}
                        onChangeText={setRestorePairingCode}
                        placeholder="Pairing code"
                        mode="outlined"
                        autoCapitalize="characters"
                        autoCorrect={false}
                        style={styles.paperInput}
                        contentStyle={styles.paperInputContent}
                        outlineStyle={styles.paperOutline}
                        textColor={activeTheme.text}
                      />
                    </>
                  )}
                </>
              )}

              {setupMode !== 'passkey' ? (
                <>
                  <PaperTextInput
                    value={setupPassword}
                    onChangeText={setSetupPassword}
                    placeholder="Password"
                    secureTextEntry
                    mode="outlined"
                    style={styles.paperInput}
                    contentStyle={styles.paperInputContent}
                    outlineStyle={styles.paperOutline}
                    textColor={activeTheme.text}
                  />
                  <PaperTextInput
                    value={setupPasswordConfirm}
                    onChangeText={setSetupPasswordConfirm}
                    placeholder="Confirm password"
                    secureTextEntry
                    mode="outlined"
                    style={styles.paperInput}
                    contentStyle={styles.paperInputContent}
                    outlineStyle={styles.paperOutline}
                    textColor={activeTheme.text}
                  />
                </>
              ) : null}

              {submitLoading ? renderSetupProgress(submitStatus ?? 'Working…') : null}

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <PaperButton
                mode="contained"
                style={styles.paperPrimaryButton}
                buttonColor={activeTheme.primaryButton}
                textColor={activeTheme.primaryButtonText}
                disabled={submitLoading}
                onPress={() => void handleAddWallet()}
              >
                {submitLoading ? 'Working...' : setupMode === 'create' ? 'Create wallet' : setupMode === 'passkey' ? 'Create with passkey' : 'Import wallet'}
              </PaperButton>
            </View>
          ) : null}

          {walletListExpanded ? (
            <View style={styles.stack}>
              {walletsByChain.map(({ chain, wallets }) => {
                const meta = chainMeta(chain.id);
                return (
                  <View key={chain.id} style={styles.walletGroupSection}>
                    <Text style={styles.walletGroupTitle}>{chain.label}</Text>
                    <View style={styles.stack}>
                      {wallets.map((wallet) => {
                        const active = wallet.id === walletState.selectedWalletIds[wallet.chain];
                        return (
                          <Pressable
                            key={wallet.id}
                            onPress={() => void handleSelectWallet(wallet.id, wallet.chain)}
                            style={[styles.walletRow, active ? styles.walletRowActive : null]}
                          >
                            <View style={[styles.walletGlyph, { borderColor: `${meta.accent}55`, backgroundColor: `${meta.accent}18` }]}>
                              <Text style={[styles.walletGlyphText, { color: meta.accent }]}>{meta.short}</Text>
                            </View>
                            <View style={styles.walletCopy}>
                              <Text style={styles.walletName}>{wallet.name}</Text>
                              <Text style={styles.walletMeta}>{formatWalletSource(wallet)}</Text>
                              <Text style={styles.walletMeta}>{shortenAddress(wallet.address)}</Text>
                            </View>
                            <View style={styles.walletRowActions}>
                              {active ? (
                                <View style={styles.activePill}>
                                  <Text style={styles.activePillText}>Active</Text>
                                </View>
                              ) : null}
                              <Pressable
                                style={styles.walletDeleteButton}
                                onPress={(event) => {
                                  event.stopPropagation();
                                  void handleDeleteWallet(wallet);
                                }}
                              >
                                <Feather name="trash-2" size={16} color={activeTheme.danger} />
                              </Pressable>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
          </>
        )}

        {renderSettingsSection(
          'session',
          'Session',
          unlocked ? 'Unlocked' : 'Locked',
          <>
            <Text style={styles.sectionHint}>Lock the app and require password unlock again.</Text>
            <Pressable style={styles.secondaryButton} onPress={handleLock}>
              <Text style={styles.secondaryButtonText}>Lock wallet</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  function renderReadyScreen() {
    return (
      <>
        <KeyboardAvoidingView
          style={styles.screenFlex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
        <ScrollView
          contentContainerStyle={[
            styles.mainContent,
            {
              paddingHorizontal: mainTab === 'discover' ? 0 : screenPadding,
              paddingBottom: mainTab === 'discover' ? 0 : sendScreenVisible || swapScreenVisible || bridgeScreenVisible ? 220 : 140,
              flexGrow: mainTab === 'discover' ? 1 : undefined
            }
          ]}
          scrollEnabled={mainTab !== 'discover'}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
            <Animated.View
              style={[
                styles.screenShell,
                {
                  maxWidth: contentMaxWidth,
                  flex: mainTab === 'discover' ? 1 : undefined,
                  opacity: screenEnterOpacity,
                  transform: [{ translateY: screenEnterLift }, { scale: screenEnterScale }]
                }
              ]}
            >
              {mainTab === 'discover' ? null : (
                <View style={styles.mobileAppBar}>
                  <View style={styles.mobileAppBarCopy}>
                    {renderBrandWordmark()}
                  </View>
                </View>
              )}

            {error ? (
              <View style={styles.inlineErrorCard}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {sendScreenVisible
              ? renderSendTab()
              : swapScreenVisible
                ? renderSwapTab()
                : bridgeScreenVisible
                  ? renderBridgeTab()
                  : mainTab === 'home'
                    ? renderHomeTab()
                    : mainTab === 'receive'
                      ? renderReceiveTab()
                      : mainTab === 'discover'
                        ? renderDiscoverTab()
                      : mainTab === 'governance'
                        ? renderGovernanceTab()
                        : mainTab === 'activity'
                          ? renderActivityTab()
                          : renderSettingsTab()}
          </Animated.View>
        </ScrollView>
        </KeyboardAvoidingView>

        {sendScreenVisible || swapScreenVisible || bridgeScreenVisible ? null : (
        <View style={[styles.footerShell, { left: footerInset, right: footerInset, bottom: footerInset - 2 }]}>
          <Pressable
            style={[styles.footerButton, mainTab === 'home' ? styles.footerButtonActive : null]}
            onPress={() => setMainTab('home')}
          >
            <MaterialCommunityIcons name="home-variant-outline" size={24} color={mainTab === 'home' ? activeTheme.text : activeTheme.muted} />
            <Text style={[styles.footerLabel, mainTab === 'home' ? styles.footerLabelActive : null]}>Home</Text>
          </Pressable>
          <Pressable
            style={[styles.footerButton, mainTab === 'discover' ? styles.footerButtonActive : null]}
            onPress={() => setMainTab('discover')}
          >
            <MaterialCommunityIcons name="compass-outline" size={24} color={mainTab === 'discover' ? activeTheme.text : activeTheme.muted} />
            <Text style={[styles.footerLabel, mainTab === 'discover' ? styles.footerLabelActive : null]}>Discover</Text>
          </Pressable>
          <Pressable
            style={[styles.footerButton, mainTab === 'governance' ? styles.footerButtonActive : null]}
            onPress={() => setMainTab('governance')}
          >
            <MaterialCommunityIcons name="bank-outline" size={24} color={mainTab === 'governance' ? activeTheme.text : activeTheme.muted} />
            <Text style={[styles.footerLabel, mainTab === 'governance' ? styles.footerLabelActive : null]}>Gov</Text>
          </Pressable>
          <Pressable
            style={[styles.footerButton, mainTab === 'activity' ? styles.footerButtonActive : null]}
            onPress={() => setMainTab('activity')}
          >
            <MaterialCommunityIcons name="history" size={24} color={mainTab === 'activity' ? activeTheme.text : activeTheme.muted} />
            <Text style={[styles.footerLabel, mainTab === 'activity' ? styles.footerLabelActive : null]}>Activity</Text>
          </Pressable>
          <Pressable
            style={[styles.footerButton, mainTab === 'settings' ? styles.footerButtonActive : null]}
            onPress={() => setMainTab('settings')}
          >
            <MaterialCommunityIcons name="cog-outline" size={24} color={mainTab === 'settings' ? activeTheme.text : activeTheme.muted} />
            <Text style={[styles.footerLabel, mainTab === 'settings' ? styles.footerLabelActive : null]}>Settings</Text>
          </Pressable>
        </View>
        )}
        <Portal>
          <PaperModal
            visible={chainPickerVisible}
            onDismiss={() => setChainPickerVisible(false)}
            contentContainerStyle={[styles.sendAssetPickerModal, styles.chainPickerModal]}
          >
            <View style={styles.sendAssetPickerHeader}>
              <Text style={styles.sectionTitle}>Switch chain</Text>
              <Text style={styles.sectionHint}>Choose which chain wallet to open from the top card.</Text>
            </View>
            <View style={styles.stack}>
              {availableChains.map((chain) => {
                const meta = chainMeta(chain.id);
                const chainOptionWallets = dedupeVisibleWallets(walletState.wallets.filter((wallet) => wallet.chain === chain.id));
                const activeWallet = getSelectedWallet(walletState, chain.id);
                const active = walletState.selectedChain === chain.id;

                return (
                  <Pressable
                    key={chain.id}
                    style={[styles.chainPickerOption, active ? styles.chainPickerOptionActive : null]}
                    onPress={() => void handleSelectChain(chain.id)}
                  >
                    <View style={[styles.chainPickerGlyph, { borderColor: `${meta.accent}55`, backgroundColor: `${meta.accent}18` }]}>
                      <Text style={[styles.chainPickerGlyphText, { color: meta.accent }]}>{meta.short}</Text>
                    </View>
                    <View style={styles.chainPickerCopy}>
                      <View style={styles.chainPickerTitleRow}>
                        <Text style={styles.chainPickerTitle}>{meta.label}</Text>
                        <Text style={styles.chainPickerMeta}>
                          {chainOptionWallets.length} wallet{chainOptionWallets.length === 1 ? '' : 's'}
                        </Text>
                      </View>
                      <Text style={styles.chainPickerAddress}>
                        {activeWallet ? `${activeWallet.name} · ${shortenAddress(activeWallet.address)}` : 'No wallet selected'}
                      </Text>
                    </View>
                    {active ? <Feather name="check" size={18} color={activeTheme.text} style={styles.rowCheckIcon} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </PaperModal>
          <PaperModal
            visible={!!discoverApproval}
            onDismiss={handleRejectDiscoverRequest}
            contentContainerStyle={[styles.sendAssetPickerModal, styles.discoverApprovalModal]}
          >
            <View style={styles.sendAssetPickerHeader}>
              <Text style={styles.sectionTitle}>Approve in Grape Discover</Text>
              <Text style={styles.sectionHint}>
                {discoverApproval
                  ? `${discoverApproval.originHost} wants to ${discoverApproval.request.method === 'connect'
                    ? 'connect to your wallet'
                    : discoverApproval.request.method === 'signMessage'
                      ? 'sign a message'
                      : discoverApproval.request.method === 'signTransaction' || discoverApproval.request.method === 'signAllTransactions'
                        ? 'sign a transaction'
                        : 'send a transaction'}`
                  : ''}
              </Text>
            </View>
            {discoverApproval ? (
              <View style={styles.stack}>
                <View style={styles.exportSecretCard}>
                  <Text style={styles.exportSecretLabel}>Origin</Text>
                  <Text style={styles.settingsMono}>{discoverApproval.origin}</Text>
                </View>
                <View style={styles.exportSecretCard}>
                  <Text style={styles.exportSecretLabel}>Wallet</Text>
                  <Text style={styles.settingsMono}>{discoverWallet ? `${discoverWallet.name} • ${discoverWallet.address}` : 'No Solana wallet selected'}</Text>
                </View>
                {discoverApproval.request.method === 'connect' ? (
                  <Pressable
                    style={styles.checkboxRow}
                    onPress={() =>
                      setDiscoverApproval((currentValue) =>
                        currentValue ? { ...currentValue, rememberOrigin: !currentValue.rememberOrigin } : currentValue
                      )
                    }
                  >
                    <Checkbox status={discoverApproval.rememberOrigin ? 'checked' : 'unchecked'} color={activeTheme.grape} />
                    <Text style={styles.checkboxLabel}>Trust this site for future connects</Text>
                  </Pressable>
                ) : null}
                <View style={styles.walletToolsRow}>
                  <PaperButton mode="outlined" style={[styles.paperSecondaryButton, styles.walletToolButton]} onPress={handleRejectDiscoverRequest}>
                    Reject
                  </PaperButton>
                  <PaperButton
                    mode="contained"
                    style={[styles.paperPrimaryButton, styles.walletToolButton]}
                    buttonColor={activeTheme.primaryButton}
                    textColor={activeTheme.primaryButtonText}
                    disabled={submitLoading}
                    onPress={() => void handleApproveDiscoverRequest()}
                  >
                    {submitLoading ? 'Approving...' : 'Approve'}
                  </PaperButton>
                </View>
              </View>
            ) : null}
          </PaperModal>
          <PaperModal
            visible={qrScannerVisible}
            onDismiss={() => {
              setQrScannerVisible(false);
              setQrScannerTarget(null);
            }}
            contentContainerStyle={styles.sendAssetPickerModal}
          >
            <View style={styles.sendAssetPickerHeader}>
              <Text style={styles.sectionTitle}>{qrScannerTarget === 'send' ? 'Scan recipient QR' : 'Scan restore QR'}</Text>
              <Text style={styles.sectionHint}>
                {qrScannerTarget === 'send'
                  ? 'Point the camera at the recipient wallet QR to fill the send address.'
                  : 'Point the camera at the Grape restore QR.'}
              </Text>
            </View>
            <View style={styles.qrScannerCard}>
              {cameraPermission?.granted ? (
                <CameraView
                  style={styles.qrScannerCamera}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={({ data }) => {
                    if (typeof data === 'string' && data.trim()) {
                      handleQrScanned(data.trim());
                    }
                  }}
                />
              ) : (
                <View style={styles.qrScannerEmpty}>
                  <Text style={styles.sectionHint}>
                    {qrScannerTarget === 'send'
                      ? 'Camera permission is required to scan a recipient QR.'
                      : 'Camera permission is required to scan the restore QR.'}
                  </Text>
                </View>
              )}
            </View>
            <PaperButton
              mode="outlined"
              style={styles.paperSecondaryButton}
              onPress={() => {
                setQrScannerVisible(false);
                setQrScannerTarget(null);
              }}
            >
              Close scanner
            </PaperButton>
          </PaperModal>
          <PaperModal
            visible={sendAssetPickerVisible}
            onDismiss={() => setSendAssetPickerVisible(false)}
            contentContainerStyle={styles.sendAssetPickerModal}
          >
            <View style={styles.sendAssetPickerHeader}>
              <Text style={styles.sectionTitle}>Select asset</Text>
              <Text style={styles.sectionHint}>{assets.length} available in this wallet</Text>
            </View>
            <PaperTextInput
              value={sendAssetSearch}
              onChangeText={setSendAssetSearch}
              placeholder="Search by name, symbol, or address"
              mode="outlined"
              style={styles.paperInput}
              contentStyle={styles.paperInputContent}
              outlineStyle={styles.paperOutline}
              textColor={activeTheme.text}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <ScrollView style={styles.sendAssetPickerList} keyboardShouldPersistTaps="handled">
              <View style={styles.stack}>
                {filteredSendAssets.length === 0 ? (
                  <Text style={styles.sectionHint}>No assets match your search.</Text>
                ) : (
                  filteredSendAssets.map((asset) => {
                    const active = asset.id === selectedSendAsset?.id;
                    const assetSubtitle = getAssetSubtitle(asset, selectedChainMeta.label, selectedChainMeta.short);
                    return (
                      <Pressable
                        key={asset.id}
                        style={[styles.assetRow, active ? styles.assetRowActive : null]}
                        onPress={() => {
                          setSendAssetId(asset.id);
                          setSendAssetPickerVisible(false);
                          setSendAssetSearch('');
                        }}
                      >
                        <View style={styles.assetGlyph}>
                          {renderAssetGlyph(asset, 52, styles.assetGlyphText, styles.assetGlyphImage)}
                        </View>
                        <View style={styles.assetCopy}>
                          <Text style={styles.assetName}>{asset.name}</Text>
                          {assetSubtitle ? <Text style={styles.assetMeta}>{assetSubtitle}</Text> : null}
                        </View>
                        <View style={styles.assetValueStack}>
                          <Text style={styles.assetValue}>{maskValue(asset.amountLabel, walletState.privacyMode)}</Text>
                          {asset.valueLabel ? (
                            <Text style={styles.assetValueMeta}>{maskValue(asset.valueLabel, walletState.privacyMode)}</Text>
                          ) : null}
                        </View>
                        {active ? <Feather name="check" size={18} color={activeTheme.text} style={styles.rowCheckIcon} /> : null}
                      </Pressable>
                    );
                  })
                )}
              </View>
            </ScrollView>
          </PaperModal>
          <PaperModal
            visible={swapInputPickerVisible}
            onDismiss={() => setSwapInputPickerVisible(false)}
            contentContainerStyle={styles.sendAssetPickerModal}
          >
            <View style={styles.sendAssetPickerHeader}>
              <Text style={styles.sectionTitle}>Swap from</Text>
              <Text style={styles.sectionHint}>{swappableAssets.length} available in this wallet</Text>
            </View>
            <PaperTextInput
              value={swapAssetSearch}
              onChangeText={setSwapAssetSearch}
              placeholder="Search by name, symbol, or address"
              mode="outlined"
              style={styles.paperInput}
              contentStyle={styles.paperInputContent}
              outlineStyle={styles.paperOutline}
              textColor={activeTheme.text}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <ScrollView style={styles.sendAssetPickerList} keyboardShouldPersistTaps="handled">
              <View style={styles.stack}>
                {filteredSwapAssets.length === 0 ? (
                  <Text style={styles.sectionHint}>No assets match your search.</Text>
                ) : (
                  filteredSwapAssets.map((asset) => {
                    const active = asset.id === selectedSwapInputAsset?.id;
                    const assetSubtitle = getAssetSubtitle(asset, selectedChainMeta.label, selectedChainMeta.short);
                    return (
                      <Pressable
                        key={asset.id}
                        style={[styles.assetRow, active ? styles.assetRowActive : null]}
                        onPress={() => {
                          setSwapInputAssetId(asset.id);
                          if (swapOutputAssetId === asset.id) {
                            setSwapOutputAssetId(null);
                          }
                          setSwapQuote(null);
                          setSwapSelectedRouteId(null);
                          setSwapInputPickerVisible(false);
                          setSwapAssetSearch('');
                        }}
                      >
                        <View style={styles.assetGlyph}>
                          {renderAssetGlyph(asset, 52, styles.assetGlyphText, styles.assetGlyphImage)}
                        </View>
                        <View style={styles.assetCopy}>
                          <Text style={styles.assetName}>{asset.name}</Text>
                          {assetSubtitle ? <Text style={styles.assetMeta}>{assetSubtitle}</Text> : null}
                        </View>
                        <View style={styles.assetValueStack}>
                          <Text style={styles.assetValue}>{maskValue(asset.amountLabel, walletState.privacyMode)}</Text>
                          {asset.valueLabel ? <Text style={styles.assetValueMeta}>{maskValue(asset.valueLabel, walletState.privacyMode)}</Text> : null}
                        </View>
                        {active ? <Feather name="check" size={18} color={activeTheme.text} style={styles.rowCheckIcon} /> : null}
                      </Pressable>
                    );
                  })
                )}
              </View>
            </ScrollView>
          </PaperModal>
          <PaperModal
            visible={swapOutputPickerVisible}
            onDismiss={() => setSwapOutputPickerVisible(false)}
            contentContainerStyle={styles.sendAssetPickerModal}
          >
            <View style={styles.sendAssetPickerHeader}>
              <Text style={styles.sectionTitle}>Swap to</Text>
              <Text style={styles.sectionHint}>{swapOutputCandidates.length} available in this wallet</Text>
            </View>
            <PaperTextInput
              value={swapAssetSearch}
              onChangeText={setSwapAssetSearch}
              placeholder="Search by name, symbol, or address"
              mode="outlined"
              style={styles.paperInput}
              contentStyle={styles.paperInputContent}
              outlineStyle={styles.paperOutline}
              textColor={activeTheme.text}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <ScrollView style={styles.sendAssetPickerList} keyboardShouldPersistTaps="handled">
              <View style={styles.stack}>
                {filteredSwapAssets.filter((asset) => asset.id !== selectedSwapInputAsset?.id).length === 0 ? (
                  <Text style={styles.sectionHint}>No output assets match your search.</Text>
                ) : (
                  filteredSwapAssets
                    .filter((asset) => asset.id !== selectedSwapInputAsset?.id)
                    .map((asset) => {
                      const active = asset.id === selectedSwapOutputAsset?.id;
                      const assetSubtitle = getAssetSubtitle(asset, selectedChainMeta.label, selectedChainMeta.short);
                      return (
                        <Pressable
                          key={asset.id}
                          style={[styles.assetRow, active ? styles.assetRowActive : null]}
                          onPress={() => {
                            setSwapOutputAssetId(asset.id);
                            setSwapQuote(null);
                            setSwapSelectedRouteId(null);
                            setSwapOutputPickerVisible(false);
                            setSwapAssetSearch('');
                          }}
                        >
                          <View style={styles.assetGlyph}>
                            {renderAssetGlyph(asset, 52, styles.assetGlyphText, styles.assetGlyphImage)}
                          </View>
                          <View style={styles.assetCopy}>
                            <Text style={styles.assetName}>{asset.name}</Text>
                            {assetSubtitle ? <Text style={styles.assetMeta}>{assetSubtitle}</Text> : null}
                          </View>
                          <View style={styles.assetValueStack}>
                            <Text style={styles.assetValue}>{maskValue(asset.amountLabel, walletState.privacyMode)}</Text>
                            {asset.valueLabel ? <Text style={styles.assetValueMeta}>{maskValue(asset.valueLabel, walletState.privacyMode)}</Text> : null}
                          </View>
                          {active ? <Feather name="check" size={18} color={activeTheme.text} style={styles.rowCheckIcon} /> : null}
                        </Pressable>
                      );
                    })
                )}
              </View>
            </ScrollView>
          </PaperModal>
        </Portal>
      </>
    );
  }

  return (
    <PaperProvider theme={paperTheme}>
    <SafeAreaView style={styles.safe}>
      <StatusBar style={activeTheme.id === 'champagne' ? 'dark' : 'light'} />
      {backgroundAsset ? (
        <Image
          source={backgroundAsset}
          style={[styles.backgroundImage, { opacity: activeTheme.backgroundImageOpacity }]}
          blurRadius={activeTheme.backgroundImageBlur}
        />
      ) : null}
      {activeTheme.backgroundTint ? <View style={[styles.backgroundTint, { backgroundColor: activeTheme.backgroundTint }]} pointerEvents="none" /> : null}
      <View style={styles.bgGlowTop} pointerEvents="none" />
      <View style={styles.bgGlowBottom} pointerEvents="none" />

      {screen === 'loading' ? (
        <View style={styles.centered}>
          <Animated.View
            style={[
              styles.launchShell,
              {
                opacity: launchFade,
                transform: [{ translateY: launchLift }, { scale: launchScale }]
              }
            ]}
          >
            <Animated.View style={[styles.launchHalo, { opacity: launchHalo }]} />
            <View style={styles.logoOrb}>
              {renderBrandLogo(40)}
            </View>
            <View style={styles.launchWordmark}>{renderBrandWordmark()}</View>
            <Text style={styles.launchTitle}>Your social wallet is getting ready</Text>
            <Text style={styles.launchCopy}>
              Unlock communities, assets, governance, and identity across every chain you use.
            </Text>
            <View style={styles.launchProgressRow}>
                <ActivityIndicator color={activeTheme.grape} />
              <Text style={styles.loadingText}>Loading Grape</Text>
            </View>
          </Animated.View>
        </View>
      ) : null}

      {screen === 'setup' ? renderSetupScreen() : null}
      {screen === 'locked' ? renderLockedScreen() : null}
      {screen === 'ready' ? renderReadyScreen() : null}
    </SafeAreaView>
    </PaperProvider>
  );
}

function createStyles(palette: MobileThemePalette) {
  return StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: palette.bg
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject
  },
  backgroundTint: {
    ...StyleSheet.absoluteFillObject
  },
  screenFlex: {
    flex: 1
  },
  content: {
    flexGrow: 1,
    paddingVertical: 14,
    paddingBottom: 40,
    gap: 16
  },
  screenShell: {
    width: '100%',
    alignSelf: 'center',
    gap: 16
  },
  lockedScrollContent: {
    flexGrow: 1,
    paddingVertical: 28,
    justifyContent: 'center'
  },
  mainContent: {
    paddingTop: 18,
    paddingBottom: 140,
    gap: 20
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 28
  },
  launchShell: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 34,
    borderRadius: 32,
    backgroundColor: palette.id === 'apple' ? 'rgba(28, 36, 46, 0.48)' : 'rgba(19, 12, 30, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 18 },
    elevation: 10
  },
  launchHalo: {
    position: 'absolute',
    top: -72,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(181, 123, 255, 0.28)'
  },
  launchWordmark: {
    marginTop: 18
  },
  launchTitle: {
    marginTop: 18,
    color: palette.text,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    textAlign: 'center'
  },
  launchCopy: {
    marginTop: 10,
    color: palette.muted,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center'
  },
  launchProgressRow: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  bgGlowTop: {
    position: 'absolute',
    top: -140,
    right: -90,
    width: 320,
    height: 320,
    borderRadius: 999,
    opacity: 0.18,
    backgroundColor: palette.bgGlowTop
  },
  bgGlowBottom: {
    position: 'absolute',
    bottom: -150,
    left: -100,
    width: 340,
    height: 340,
    borderRadius: 999,
    opacity: 0.14,
    backgroundColor: palette.bgGlowBottom
  },
  logoOrb: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8, 4, 18, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8
  },
  loadingText: {
    marginTop: 12,
    color: palette.text,
    fontSize: 16,
    fontWeight: '600'
  },
  heroBlock: {
    paddingTop: 20,
    gap: 8
  },
  brand: {
    color: palette.grape,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 4,
    alignSelf: 'flex-start',
    textAlign: 'left',
    marginTop: -4
  },
  heroTitle: {
    color: palette.text,
    fontSize: 38,
    fontWeight: '800'
  },
  heroTitleCompact: {
    fontSize: 32
  },
  heroCopy: {
    color: palette.muted,
    fontSize: 16,
    lineHeight: 25
  },
  formChoiceRow: {
    gap: 10
  },
  formChoiceLabel: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase'
  },
  section: {
    gap: 12
  },
  sectionCard: {
    backgroundColor: palette.panel,
    borderColor: palette.panelBorder,
    borderWidth: 1,
    borderRadius: 30,
    padding: 20,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: palette.id === 'apple' || palette.id === 'champagne' ? 0 : 0.24,
    shadowRadius: palette.id === 'apple' || palette.id === 'champagne' ? 0 : 26,
    shadowOffset: { width: 0, height: 16 },
    elevation: palette.id === 'apple' || palette.id === 'champagne' ? 0 : 10
  },
  formCard: {
    padding: 18,
    gap: 18
  },
  setupProgressShell: {
    gap: 10,
    marginTop: -2
  },
  setupProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  setupProgressLabel: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700'
  },
  setupProgressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: palette.softPanel,
    borderWidth: 1,
    borderColor: palette.panelBorder
  },
  setupProgressFill: {
    width: '58%',
    height: '100%',
    borderRadius: 999,
    opacity: 0.96
  },
  inlineErrorCard: {
    backgroundColor: 'rgba(255, 94, 122, 0.12)',
    borderColor: 'rgba(255, 142, 161, 0.25)',
    borderWidth: 1,
    borderRadius: 18,
    padding: 14
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  settingsGroupHeading: {
    gap: 4,
    paddingHorizontal: 2,
    paddingTop: 6
  },
  settingsGroupEyebrow: {
    color: palette.primaryButton,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase'
  },
  settingsSectionToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12
  },
  settingsSectionToggleCopy: {
    flex: 1,
    gap: 4
  },
  settingsSectionSummary: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20
  },
  sectionTitle: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '800'
  },
  sectionHint: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'left'
  },
  walletToolsRow: {
    flexDirection: 'row',
    gap: 10
  },
  formWalletToolsRow: {
    gap: 12,
    flexWrap: 'wrap'
  },
  formWalletToolsStack: {
    gap: 12
  },
  walletToolButton: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 96
  },
  mnemonicCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.panelBorder
  },
  formMnemonicCard: {
    padding: 18
  },
  mnemonicWordGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  mnemonicWordPill: {
    minWidth: '30%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 4
  },
  mnemonicWordIndex: {
    color: palette.grape,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4
  },
  mnemonicWordText: {
    color: palette.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700'
  },
  input: {
    minHeight: 56,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 16,
    color: palette.text,
    fontSize: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 }
  },
  formInput: {
    minHeight: 58,
    fontSize: 17
  },
  textarea: {
    minHeight: 132,
    textAlignVertical: 'top',
    paddingTop: 16
  },
  errorText: {
    color: palette.danger,
    fontSize: 14,
    lineHeight: 20
  },
  primaryButton: {
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: palette.primaryButton,
    shadowColor: palette.primaryButton,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8
  },
  buttonDisabled: {
    opacity: 0.55
  },
  primaryButtonText: {
    color: palette.primaryButtonText,
    fontSize: 16,
    fontWeight: '800'
  },
  secondaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor: palette.id === 'apple' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'
  },
  secondaryButtonText: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '700'
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  checkboxLabel: {
    flex: 1,
    color: palette.text,
    fontSize: 14,
    lineHeight: 20
  },
  lockedCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: palette.panel,
    borderColor: palette.panelBorder,
    borderWidth: 1,
    borderRadius: 32,
    paddingTop: 18,
    paddingRight: 24,
    paddingBottom: 24,
    paddingLeft: 24,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: palette.id === 'apple' || palette.id === 'champagne' ? 0 : 0.28,
    shadowRadius: palette.id === 'apple' || palette.id === 'champagne' ? 0 : 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: palette.id === 'apple' || palette.id === 'champagne' ? 0 : 12
  },
  lockLogoCluster: {
    position: 'relative',
    alignSelf: 'flex-start',
    marginTop: -2,
    marginBottom: -2,
    marginLeft: -2,
    width: 82,
    height: 82,
    alignItems: 'center',
    justifyContent: 'center'
  },
  lockLogoHalo: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: palette.grape,
    opacity: 0.08
  },
  lockedTitle: {
    color: palette.text,
    fontSize: 34,
    fontWeight: '800',
    alignSelf: 'flex-start',
    textAlign: 'left'
  },
  lockedTitleCompact: {
    fontSize: 30
  },
  mobileAppBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 4,
    paddingTop: 4
  },
  mobileAppBarCopy: {
    flex: 1,
    gap: 2,
    marginTop: 5
  },
  heroCard: {
    backgroundColor: palette.panel,
    borderColor: palette.panelBorder,
    borderWidth: 1,
    borderRadius: 36,
    padding: 24,
    gap: 18,
    shadowColor: '#000',
    shadowOpacity: palette.id === 'apple' || palette.id === 'champagne' ? 0 : 0.26,
    shadowRadius: palette.id === 'apple' || palette.id === 'champagne' ? 0 : 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: palette.id === 'apple' || palette.id === 'champagne' ? 0 : 12
  },
  walletIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1
  },
  walletAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1
  },
  walletAvatarButton: {
    position: 'relative'
  },
  walletAvatarSwitchBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.panel,
    backgroundColor: palette.bg
  },
  walletAvatarText: {
    fontSize: 17,
    fontWeight: '900'
  },
  walletIdentityCopy: {
    gap: 2,
    flex: 1
  },
  walletIdentityMeta: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '600'
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  refreshChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.id === 'apple' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.14)'
        : palette.id === 'champagne'
          ? 'rgba(128,93,36,0.08)'
          : 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  refreshGlyphWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center'
  },
  refreshChipText: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 22,
    textAlign: 'center',
    includeFontPadding: false
  },
  cardLabel: {
    color: palette.muted,
    fontSize: 13,
    letterSpacing: 2,
    textTransform: 'uppercase'
  },
  cardName: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '800'
  },
  cardAddress: {
    color: palette.text,
    fontSize: 31,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.3
  },
  balanceBlock: {
    gap: 6
  },
  cardBalance: {
    color: palette.text,
    fontSize: 34,
    fontWeight: '800'
  },
  cardSubtle: {
    color: palette.muted,
    fontSize: 14,
    flexShrink: 1
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'nowrap'
  },
  quickActionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 22,
    paddingVertical: 15,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.68)'
          : 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.14)'
        : palette.id === 'champagne'
          ? 'rgba(128,93,36,0.08)'
          : 'rgba(255,255,255,0.06)'
  },
  quickActionButtonDisabled: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 22,
    paddingVertical: 15,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.06)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.52)'
          : 'rgba(255,255,255,0.03)'
  },
  quickActionGlyph: {
    color: palette.text,
    fontSize: 24,
    fontWeight: '800'
  },
  quickActionLabel: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700'
  },
  quickActionLabelMuted: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: '700'
  },
  discoverPromoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.1)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.76)'
          : 'rgba(255,255,255,0.06)'
  },
  discoverPromoCopy: {
    flex: 1,
    gap: 4
  },
  discoverPromoEyebrow: {
    color: palette.grape,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase'
  },
  discoverPromoTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '900'
  },
  discoverPromoGlyph: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor: 'rgba(255,255,255,0.08)'
  },
  discoverScreen: {
    flex: 1,
    gap: 12,
    minHeight: 0,
    paddingTop: Platform.OS === 'android' ? 28 : 10
  },
  discoverBrowserBar: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: Platform.OS === 'android' ? 36 : 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.1)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.76)'
          : 'rgba(255,255,255,0.06)',
    gap: 12
  },
  discoverBrowserBarPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  discoverBrowserBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  discoverHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12
  },
  discoverHeaderCopy: {
    flex: 1,
    gap: 4
  },
  discoverBetaPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(139,247,198,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(139,247,198,0.14)'
  },
  discoverBetaPillText: {
    color: palette.mint,
    fontSize: 12,
    fontWeight: '800'
  },
  discoverEmptyCard: {
    gap: 6,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 190, 92, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 190, 92, 0.12)',
    marginBottom: 12
  },
  discoverEmptyTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '800'
  },
  discoverToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  discoverAddressInput: {
    flex: 1,
    marginBottom: 0
  },
  discoverGoButton: {
    borderRadius: 16
  },
  discoverControls: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12
  },
  discoverControlButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor: 'rgba(255,255,255,0.06)'
  },
  discoverControlButtonDisabled: {
    opacity: 0.48
  },
  discoverFavoriteRow: {
    gap: 10,
    paddingTop: 14,
    paddingBottom: 2
  },
  discoverFavoriteCard: {
    width: 164,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor: 'rgba(255,255,255,0.05)',
    gap: 4
  },
  discoverFavoriteTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '800'
  },
  discoverFavoriteSubtitle: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 18
  },
  discoverWebviewShell: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.08)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.04)'
  },
  discoverWebviewMeta: {
    color: palette.muted,
    fontSize: 12
  },
  discoverInlineError: {
    paddingHorizontal: 16,
    paddingTop: 12
  },
  discoverWebviewFrame: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#05060a'
  },
  discoverWebview: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#05060a'
  },
  discoverTrustedOriginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    justifyContent: 'space-between'
  },
  discoverTrustedOriginText: {
    flex: 1,
    color: palette.text,
    fontSize: 14,
    fontWeight: '700'
  },
  walletSwitchRow: {
    gap: 10,
    paddingRight: 6
  },
  walletSwitchChip: {
    minWidth: 138,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: palette.panelBorder,
    gap: 4
  },
  walletSwitchChipActive: {
    backgroundColor: 'rgba(255,255,255,0.1)'
  },
  walletSwitchChipTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '800'
  },
  walletSwitchChipTitleActive: {
    color: palette.grape
  },
  walletSwitchChipAddress: {
    color: palette.muted,
    fontSize: 13
  },
  formPillRow: {
    gap: 10
  },
  stack: {
    gap: 12
  },
  chainPickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 15,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.05)'
  },
  chainPickerOptionActive: {
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.12)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.84)'
          : 'rgba(255,255,255,0.1)'
  },
  chainPickerGlyph: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1
  },
  chainPickerGlyphText: {
    fontSize: 15,
    fontWeight: '900'
  },
  chainPickerCopy: {
    flex: 1,
    gap: 3
  },
  chainPickerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  chainPickerTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '800'
  },
  chainPickerMeta: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700'
  },
  chainPickerAddress: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '600'
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 15,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.05)'
  },
  walletRowActive: {
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.12)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.84)'
          : 'rgba(255,255,255,0.1)'
  },
  walletGroupSection: {
    gap: 10
  },
  walletGroupTitle: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase'
  },
  walletGlyph: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1
  },
  walletGlyphText: {
    fontWeight: '800'
  },
  walletCopy: {
    flex: 1,
    gap: 2
  },
  walletRowActions: {
    alignItems: 'flex-end',
    gap: 8
  },
  walletName: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '800'
  },
  walletMeta: {
    color: palette.muted,
    fontSize: 14
  },
  activePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(139,247,198,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(139,247,198,0.1)'
  },
  activePillText: {
    color: palette.mint,
    fontSize: 13,
    fontWeight: '800'
  },
  walletDeleteButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 94, 122, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 94, 122, 0.14)'
  },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 15,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.05)'
  },
  assetRowActive: {
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.14)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.84)'
          : 'rgba(255,255,255,0.11)',
    borderColor: palette.primaryButton
  },
  assetGlyph: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#090b14',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  assetGlyphImage: {
    width: '100%',
    height: '100%',
    borderRadius: 22
  },
  assetGlyphText: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '800'
  },
  assetCopy: {
    flex: 1,
    gap: 2
  },
  assetName: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '800'
  },
  assetMeta: {
    color: palette.muted,
    fontSize: 14
  },
  assetValueStack: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4
  },
  assetValue: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '800'
  },
  assetValueMeta: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '600'
  },
  rowCheckIcon: {
    marginLeft: 4
  },
  rowChevron: {
    color: palette.muted,
    fontSize: 22,
    marginLeft: 4
  },
  rowChevronIcon: {
    marginLeft: 4
  },
  sendSelectedAssetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 15,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.1)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.76)'
          : 'rgba(255,255,255,0.06)'
  },
  sendAssetSelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 15,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.1)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.76)'
          : 'rgba(255,255,255,0.06)'
  },
  sendSelectedAssetGlyph: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#090b14',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  sendSelectedAssetCopy: {
    flex: 1,
    gap: 2
  },
  sendSelectedAssetName: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '800'
  },
  sendSelectedAssetMeta: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '600'
  },
  sendSelectedAssetBalance: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '800'
  },
  sendRecipientRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10
  },
  sendRecipientInputWrap: {
    flex: 1
  },
  sendScanButton: {
    justifyContent: 'center',
    minHeight: 56
  },
  sendAssetPickerModal: {
    marginHorizontal: 16,
    padding: 18,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor: palette.panel,
    maxHeight: '76%'
  },
  chainPickerModal: {
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(20, 24, 32, 0.94)'
        : palette.id === 'champagne'
          ? 'rgba(255, 248, 240, 0.96)'
          : 'rgba(17, 10, 24, 0.94)'
  },
  discoverApprovalModal: {
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(18,18,24,0.96)'
        : palette.id === 'champagne'
          ? 'rgba(255,250,244,0.98)'
          : 'rgba(18,10,10,0.97)'
  },
  sendAssetPickerHeader: {
    gap: 4,
    marginBottom: 12
  },
  sendAssetPickerList: {
    marginTop: 14
  },
  routePicker: {
    gap: 10,
    marginTop: 8,
    marginBottom: 12
  },
  routeOption: {
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.05)',
    gap: 4
  },
  routeOptionActive: {
    borderColor: palette.primaryButton,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.13)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.84)'
          : 'rgba(255,255,255,0.1)'
  },
  routeOptionLabel: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '800'
  },
  routeOptionValue: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '900'
  },
  routeOptionHelper: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '600'
  },
  swapFlowCard: {
    gap: 16,
    padding: 18
  },
  swapFlowShell: {
    gap: 12
  },
  swapLeg: {
    gap: 10
  },
  swapLegHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  swapLegLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase'
  },
  swapQuickRatios: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 3,
    borderRadius: 999,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.12)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.86)'
          : 'rgba(255,255,255,0.08)'
  },
  swapRatioChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999
  },
  swapRatioChipDisabled: {
    opacity: 0.45
  },
  swapRatioChipText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '800'
  },
  swapRatioChipTextDisabled: {
    color: palette.muted
  },
  swapLegMain: {
    gap: 10
  },
  swapSelectShell: {
    minHeight: 76
  },
  swapLegValueRow: {
    alignItems: 'flex-end'
  },
  swapLegAmountInput: {
    width: '100%',
    color: palette.text,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '900',
    textAlign: 'right',
    letterSpacing: -1.2,
    paddingVertical: 0
  },
  swapLegQuote: {
    width: '100%',
    color: palette.text,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900',
    textAlign: 'right',
    letterSpacing: -1
  },
  swapLegQuotePending: {
    color: palette.muted
  },
  swapFlipButton: {
    width: 44,
    height: 44,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: -6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.12)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.84)'
          : 'rgba(255,255,255,0.08)'
  },
  swapSettingsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end'
  },
  swapSlippageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.1)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.82)'
          : 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: palette.panelBorder
  },
  swapSlippageLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700'
  },
  swapSlippageValue: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '800'
  },
  swapRoutePicker: {
    gap: 8
  },
  swapRouteOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.05)'
  },
  swapRouteOptionActive: {
    borderColor: palette.primaryButton,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.14)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.86)'
          : 'rgba(255,255,255,0.1)'
  },
  swapRouteOptionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4
  },
  swapRouteOptionMeta: {
    alignItems: 'flex-end',
    gap: 4
  },
  swapRouteOptionTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '800'
  },
  swapRouteOptionSubtitle: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 17
  },
  swapRouteOptionValue: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '900'
  },
  swapRouteOptionImpact: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700'
  },
  swapSummaryCard: {
    gap: 12,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.74)'
          : 'rgba(255,255,255,0.05)'
  },
  swapSummaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16
  },
  swapSummaryLabel: {
    flex: 1,
    color: palette.muted,
    fontSize: 13,
    fontWeight: '700'
  },
  swapSummaryValue: {
    flex: 1,
    color: palette.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    textAlign: 'right'
  },
  receiveAddressCard: {
    padding: 18,
    borderRadius: 22,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: palette.panelBorder,
    gap: 8
  },
  qrCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: 28,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: palette.panelBorder
  },
  qrSurface: {
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 16
  },
  qrPlaceholder: {
    width: 220,
    height: 220,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: palette.panelBorder,
    alignItems: 'center',
    justifyContent: 'center'
  },
  qrPlaceholderText: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: '700'
  },
  qrScannerCard: {
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor: 'rgba(10, 7, 20, 0.9)',
    marginBottom: 14
  },
  qrScannerCamera: {
    width: '100%',
    height: 320
  },
  qrScannerEmpty: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  receiveAddressLabel: {
    color: palette.muted,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1.5
  },
  receiveAddressValue: {
    color: palette.text,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700'
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 15,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.05)'
  },
  activityGlyph: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(159,99,255,0.18)'
  },
  activityGlyphText: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '800'
  },
  activityCopy: {
    flex: 1,
    gap: 2
  },
  activityName: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '800'
  },
  activityMeta: {
    color: palette.muted,
    fontSize: 13
  },
  activityStatus: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(139,247,198,0.15)'
  },
  activityStatusText: {
    color: palette.mint,
    fontSize: 12,
    fontWeight: '800'
  },
  detailBackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start'
  },
  detailBackText: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700'
  },
  assetDetailHeroCard: {
    gap: 18
  },
  assetDetailSectionHeader: {
    gap: 2,
    alignItems: 'flex-start'
  },
  assetDetailSectionHint: {
    color: palette.muted,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'left',
    opacity: 0.72
  },
  assetDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  assetDetailGlyph: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: '#090b14',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden'
  },
  assetDetailGlyphImage: {
    width: '100%',
    height: '100%',
    borderRadius: 24
  },
  assetDetailGlyphText: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '800'
  },
  assetDetailCopy: {
    flex: 1,
    gap: 4
  },
  assetDetailName: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '800'
  },
  assetDetailSymbol: {
    color: palette.muted,
    fontSize: 15,
    fontWeight: '700'
  },
  assetDetailStats: {
    gap: 12
  },
  assetDetailAddressCard: {
    gap: 8,
    padding: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.05)'
  },
  assetDetailAddressValue: {
    color: palette.text,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    fontFamily: 'Courier'
  },
  assetDetailBalanceBlock: {
    gap: 6
  },
  assetDetailBalance: {
    color: palette.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.3
  },
  assetDetailBalanceMeta: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: '600'
  },
  assetDetailActionsRow: {
    flexDirection: 'row',
    gap: 10
  },
  assetDetailActionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 22,
    paddingVertical: 15,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.68)'
          : 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.14)'
        : palette.id === 'champagne'
          ? 'rgba(128,93,36,0.08)'
          : 'rgba(255,255,255,0.06)'
  },
  assetDetailActionButtonDisabled: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 22,
    paddingVertical: 15,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.06)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.52)'
          : 'rgba(255,255,255,0.03)'
  },
  assetDetailActionLabel: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700'
  },
  assetDetailActionLabelMuted: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: '700'
  },
  assetDetailStat: {
    gap: 4
  },
  assetDetailMetaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16
  },
  assetDetailLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  assetDetailValue: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '800'
  },
  assetDetailMeta: {
    color: palette.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600'
  },
  assetDetailMetaMono: {
    color: palette.text,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'Courier'
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  themeChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: palette.panelBorder
  },
  themeChipActive: {
    backgroundColor: palette.softPanel,
    borderColor: palette.primaryButton
  },
  themeChipText: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '700'
  },
  themeChipTextActive: {
    color: palette.text
  },
  settingsCopy: {
    flex: 1,
    gap: 4
  },
  settingsTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '800'
  },
  settingsMono: {
    color: palette.text,
    fontSize: 15,
    lineHeight: 24,
    fontFamily: 'Courier'
  },
  exportSecretCard: {
    gap: 8,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.05)'
  },
  exportSecretLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  footerShell: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    padding: 8,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor: palette.footerBg,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14
  },
  footerButton: {
    flex: 1,
    minHeight: 62,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 22
  },
  footerButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.1)'
  },
  footerGlyph: {
    color: palette.text,
    fontSize: 23,
    lineHeight: 24,
    includeFontPadding: false,
    textAlign: 'center'
  },
  footerLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700'
  },
  footerLabelActive: {
    color: palette.text
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  paperSegments: {
    marginTop: 2
  },
  setupOptionStack: {
    gap: 10
  },
  setupOptionCard: {
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: palette.panelBorder
  },
  setupOptionCardActive: {
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderColor: palette.grape
  },
  setupOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  setupOptionTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '800'
  },
  setupOptionTitleActive: {
    color: palette.grape
  },
  setupOptionMeta: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 19
  },
  setupOptionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: palette.panelBorder
  },
  setupOptionBadgeText: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '700'
  },
  paperInput: {
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  paperInputContent: {
    minHeight: 56,
    color: palette.text
  },
  paperTextAreaContent: {
    minHeight: 120,
    textAlignVertical: 'top'
  },
  paperOutline: {
    borderRadius: 20,
    borderColor: palette.panelBorder
  },
  paperPrimaryButton: {
    borderRadius: 20,
    shadowColor: palette.primaryButton,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8
  },
  paperSecondaryButton: {
    borderRadius: 18,
    backgroundColor: palette.id === 'apple' ? 'rgba(255,255,255,0.11)' : 'transparent'
  },
  inlineActionText: {
    color: palette.grape,
    fontSize: 13,
    fontWeight: '800'
  },
  communityShortcutRow: {
    flexDirection: 'row',
    gap: 10
  },
  communityShortcutStack: {
    gap: 8
  },
  communityShortcutCard: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.76)'
          : 'rgba(255,255,255,0.05)'
  },
  communityShortcutLabel: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase'
  },
  communityShortcutValue: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 18
  },
  communityShortcutMeta: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700'
  },
  communityInlineShortcut: {
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.08)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.04)'
  },
  communityInlineShortcutLabel: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase'
  },
  communityInlineShortcutValue: {
    marginTop: 2,
    color: palette.text,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 18
  },
  communityInlineShortcutMeta: {
    marginTop: 2,
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700'
  },
  successBox: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(139,247,198,0.22)',
    backgroundColor: 'rgba(139,247,198,0.12)'
  },
  successBoxText: {
    color: palette.mint,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20
  },
  governanceProposalHeader: {
    gap: 10
  },
  governanceProposalCopy: {
    flex: 1,
    gap: 4
  },
  governanceProposalTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '800'
  },
  governanceProposalBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8
  },
  governanceStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: palette.panelBorder
  },
  governanceStatusPillSuccess: {
    backgroundColor: 'rgba(139,247,198,0.14)',
    borderColor: 'rgba(139,247,198,0.1)'
  },
  governanceStatusPillText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '800'
  },
  governanceStatusPillTextSuccess: {
    color: palette.mint
  },
  governanceMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  governanceMetricText: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '700'
  },
  governanceVoteActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  governanceEligibilityCard: {
    gap: 12,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.08)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.68)'
          : 'rgba(255,255,255,0.04)'
  },
  governanceEligibilityActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  governanceVoteButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primaryButton
  },
  governanceVoteButtonText: {
    color: palette.primaryButtonText,
    fontSize: 14,
    fontWeight: '800'
  },
  governanceVoteButtonSecondary: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.1)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.76)'
          : 'rgba(255,255,255,0.06)'
  },
  governanceVoteButtonSecondaryText: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '800'
  },
  governanceOpenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.12)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.82)'
          : 'rgba(255,255,255,0.08)'
  },
  governanceOpenButtonText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '800'
  },
  reputationSummaryGrid: {
    flexDirection: 'row',
    gap: 10
  },
  reputationSummaryCard: {
    flex: 1,
    gap: 4,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.1)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.76)'
          : 'rgba(255,255,255,0.06)'
  },
  reputationSummaryLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase'
  },
  reputationSummaryValue: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '900'
  },
  reputationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.05)'
  },
  reputationLeading: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  reputationAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  reputationAvatarImage: {
    width: '100%',
    height: '100%'
  },
  reputationAvatarText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '800'
  },
  reputationCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3
  },
  reputationName: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '800'
  },
  reputationMeta: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 18
  },
  reputationPoints: {
    alignItems: 'flex-end',
    gap: 3
  },
  reputationPointsMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  reputationPointsValue: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '900'
  },
  reputationPointsLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  reputationSpaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.05)'
  },
  reputationSpaceCopy: {
    flex: 1,
    gap: 4
  },
  reputationSpaceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  reputationSpaceTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '800'
  },
  reputationSpaceMono: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Courier'
  },
  reputationRemoveButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 94, 122, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 94, 122, 0.14)'
  },
  reputationOpenButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.12)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.82)'
          : 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: palette.panelBorder
  }
  });
}
