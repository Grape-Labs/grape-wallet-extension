import 'react-native-get-random-values';

import { registerRootComponent } from 'expo';
import { Buffer } from 'buffer';

import App from './App';

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

registerRootComponent(App);
