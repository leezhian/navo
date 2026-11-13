import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import path from 'node:path';

const appIconPath = path.join(__dirname, 'assets/icons/icon');

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'Navo',
    protocols: [{ name: 'Navo task links', schemes: ['navo'] }],
    // Packager 会按目标平台选择同名的 .icns 或 .ico。
    icon: appIconPath,
    extraResource: [`${appIconPath}.png`],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({ setupIcon: `${appIconPath}.ico` }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({ options: { icon: `${appIconPath}.png` } }),
    new MakerDeb({ options: { icon: `${appIconPath}.png` } }),
  ],
  plugins: [
    // node-pty 包含原生模块和平台相关 spawn-helper，需要放在 asar 外才能运行。
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
