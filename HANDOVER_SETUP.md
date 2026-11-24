# Setup and verification

Use the current README and HANDOVER.md for the release scope. Original source hashes are in audit/source-baseline.json. No Git commits or recovered history are included.

1. Use Node 22.19.0 from .nvmrc, or the locally exercised Node 24.21.0 / npm 11.19.0.
2. Run npm ci --ignore-scripts, npm run lint, npm test, npm run build.
3. In Chrome extensions, enable Developer mode and Load unpacked from dist/.
4. For release ZIPs, install Python 3 and run npm run package. Inspect release/SHA256SUMS.txt.

Tests use a simulated DOM and Chrome storage and block real network calls. Native coverage excludes Vite-evaluated JSX modules. npm run test:coverage reports the measured native subset; it is not full application coverage.

Lint now passes. The remaining release conditions are backend and live-site acceptance, not lint suppression. Read BACKEND_CONTRACT_CHECKLIST.md before configuring the optional VITE_SUBSCRIPTION_URL in .env.local; no guessed endpoint is enabled by default. Existing authenticated operations continue to use the original JobGen services.

After any changes to source, configuration or documentation, rebuild/repackage so the ZIPs match the reviewed working files. The original dist.zip remains in the workspace only and is excluded from the handover source archive.
