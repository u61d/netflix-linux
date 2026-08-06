# Vendored dependency

`peerjs.min.js` is PeerJS's official browser (UMD) bundle, copied here directly
rather than loaded from a CDN, so this window's CSP can keep `script-src 'self'`
with no external exceptions.

`peerjs` itself is a devDependency only — it's not required at runtime, just
used as the source for this file. To update it:

```bash
npm install peerjs@<new-version> --save-dev
cp node_modules/peerjs/dist/peerjs.min.js src/renderer/windows/watchparty/vendor/peerjs.min.js
```

Then bump the version note below.

Current vendored version: **1.5.5**
