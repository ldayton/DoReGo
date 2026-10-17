import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

// Only the web sound bank belongs in an offline download, never the 401 MB originals.
export function offlineBuild(): Plugin {
  let base = '/';
  return {
    name: 'dorego-offline',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      base = config.base;
    },
    generateBundle(_options, bundle) {
      const sounds = ['bitklavier-web-v1', 'vsco-cello'].flatMap((folder) =>
        readdirSync(resolve('public/samples', folder))
          .filter((file) => file.endsWith('.flac'))
          .sort()
          .map((file) => `samples/${folder}/${file}`)
      );
      const hash = createHash('sha256');
      const files = sounds.map((path) => {
        const data = readFileSync(resolve('public', path));
        hash.update(path).update(data);
        return { url: base + path, bytes: data.length };
      });
      const soundCache = `dorego-sounds-${hash.digest('hex').slice(0, 16)}`;
      const soundPack = JSON.stringify({ cache: soundCache, files });
      const shell = [
        base,
        ...Object.keys(bundle)
          .filter((path) => path !== 'index.html')
          .map((path) => base + path),
        ...[
          'manifest.webmanifest',
          'icon.svg',
          'icon-192.png',
          'icon-512.png',
          'apple-touch-icon.png',
          'offline-pack.json',
          'samples/bitklavier/NOTICE.txt',
          'samples/vsco-cello/NOTICE.txt',
        ].map((path) => base + path),
      ];
      const version = createHash('sha256').update(soundPack);
      for (const entry of Object.values(bundle))
        version.update(entry.type === 'chunk' ? entry.code : entry.source);
      for (const path of [
        'manifest.webmanifest',
        'icon.svg',
        'icon-192.png',
        'icon-512.png',
        'apple-touch-icon.png',
      ])
        version.update(readFileSync(resolve('public', path)));
      const shellCache = `dorego-shell-${version.digest('hex').slice(0, 16)}`;
      const pack = JSON.stringify({ cache: soundCache, files, shellCache, shell });
      // No skipWaiting: an update must never replace a running practice session.
      const worker = `
const SHELL = ${JSON.stringify(shellCache)};
const SOUNDS = ${JSON.stringify(soundCache)};
const FILES = ${JSON.stringify(shell)};
const AUDIO = new Set(${JSON.stringify(files.map((f) => f.url))});
const ROOT = ${JSON.stringify(base)};
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(SHELL);
  try { await cache.addAll(FILES); }
  catch (error) { await caches.delete(SHELL); throw error; }
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  // Cache names are app-specific even on a shared github.io origin.
  for (const name of await caches.keys()) {
    if ((name.startsWith('dorego-shell-') && name !== SHELL) ||
        (name.startsWith('dorego-sounds-') && name !== SOUNDS)) await caches.delete(name);
  }
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (AUDIO.has(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(SOUNDS);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        try { await cache.put(request, response.clone()); } catch { /* Playback survives full storage. */ }
      }
      return response;
    })());
  } else if (FILES.includes(url.pathname) ||
      (request.mode === 'navigate' && url.pathname === ROOT + 'index.html')) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      return (await cache.match(url.pathname === ROOT + 'index.html' ? ROOT : url.pathname)) || fetch(request);
    })());
  }
});
`;
      this.emitFile({ type: 'asset', fileName: 'offline-pack.json', source: pack });
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: worker });
    },
  };
}
