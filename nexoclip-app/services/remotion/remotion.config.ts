import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);

// The drawn-scene harness imports components from the app; keep one copy of React and Remotion (this folder's).
import path from 'path';
Config.setPublicDir(path.resolve(process.cwd(), '../../public'));
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: {
      ...(config.resolve?.alias || {}),
      react: path.resolve(process.cwd(), 'node_modules/react'),
      'react-dom': path.resolve(process.cwd(), 'node_modules/react-dom'),
      remotion: path.resolve(process.cwd(), 'node_modules/remotion'),
    },
  },
}));
