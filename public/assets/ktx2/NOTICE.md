# Local KTX2 decoder distribution

Unmodified decoder/transcoder binaries downloaded from Babylon's official CDN on 2026-11-21. Runtime URLs are overridden to this local directory; the game does not depend on the CDN for texture decoding.

- Babylon KTX2 decoder: https://github.com/BabylonJS/Babylon.js/tree/master/packages/tools/ktx2Decoder — Apache 2.0, see LICENSE.md.
- Optimized UASTC transcoders: https://github.com/KhronosGroupArchives/Basis-Universal-Transcoders — see UASTC-LICENSE.txt.
- MSC/Basis transcoder: https://github.com/BinomialLLC/basis_universal — see BASIS-LICENSE.txt and BASIS-NOTICE.txt.
- Zstandard decoder: https://github.com/donmccurdy/zstddec-wasm — see ZSTD-LICENSE.txt (MIT and BSD).

Asset generation uses Khronos toktx 4.4.2 locally. The encoder executable is a development tool and is not included in this runtime directory.
