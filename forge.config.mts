import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

// Vite mete todo nuestro código (y las librerías de JavaScript puro) adentro de
// la carpeta .vite. Lo único que NO se puede empaquetar así es better-sqlite3,
// porque trae un archivo compilado (.node). Por eso lo dejamos "afuera" de Vite
// (ver vite.main.config.mts) y acá le decimos al empaquetador que copie de esa
// librería solo lo necesario: su código y el binario de Windows.
const DE_BETTER_SQLITE3 = ['/package.json', '/lib', '/prebuilds', '/prebuilds/win32-x64.node'];

function incluirEnElInstalador(archivo: string): boolean {
  if (!archivo) return true;
  if (archivo === '/package.json' || archivo === '/node_modules') return true;
  if (archivo.startsWith('/.vite')) return true;
  const base = '/node_modules/better-sqlite3';
  if (archivo === base) return true;
  if (!archivo.startsWith(base + '/')) return false;
  const resto = archivo.slice(base.length);
  return DE_BETTER_SQLITE3.includes(resto) || resto.startsWith('/lib/');
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    // Devuelve true para lo que hay que DEJAR AFUERA del instalador.
    ignore: (archivo) => !incluirEnElInstalador(archivo),
  },
  rebuildConfig: {},
  makers: [new MakerSquirrel({}), new MakerZIP({}, ['darwin'])],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Saca los archivos .node del asar para que Windows los pueda cargar.
    new AutoUnpackNativesPlugin({}),
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
