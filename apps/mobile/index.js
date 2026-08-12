import 'react-native-get-random-values';

import { registerRootComponent } from 'expo';
import { Buffer } from 'buffer';

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

// Load the application only after crypto and Buffer globals are installed.
// Several wallet SDKs inspect these globals while their modules initialize.
const App = require('./App').default;

registerRootComponent(App);
