# Tempo

Tempo is a warm, paper-like desktop Pomodoro timer for Windows.

It focuses on a simple daily workflow: configurable focus cycles, local session records, import/export, and quiet visual review through a day timeline, calendar quilt, and focus collection.

## Features

- Focus, short break, and long break timer flow
- Configurable focus length, break length, and cycle count
- Start, pause, resume, skip, and reset controls
- Auto-start options for breaks and focus sessions
- Local session history
- Today view with `Day Thread`, `Focus Quilt`, and `Focus Herbarium`
- Review view with daily stats and monthly calendar
- Local data import, export, and reset
- Paper-like English UI using Georgia
- Runs without requiring a dedicated GPU

## Download

For normal users, download Tempo from the GitHub Releases page:

<https://github.com/DannyWANGD/Tempo/releases>

Recommended assets:

- `Tempo Setup x.y.z.exe`: Windows installer
- `Tempo-x.y.z-win-unpacked.zip`: portable version

For the portable version, download and extract the whole zip. Do not copy only `Tempo.exe`; the app also needs the DLLs and resource files in the same folder.

## Local Data

Tempo stores data locally on your Windows account. The default data location is:

```text
C:\Users\<your-user-name>\AppData\Roaming\tempo\data
```

Typical files include:

- `preferences.json`
- `sessions.json`
- `daySummaries.json`

Tempo does not upload or sync your data. Use Settings -> Export Data and Settings -> Import Data to move records between machines.

## Development

Requirements:

- Node.js 22 or newer
- npm
- Windows for packaging Windows releases

Install dependencies:

```bash
npm ci
```

Start the desktop app in development mode:

```bash
npm run dev
```

Run checks:

```bash
npm run typecheck
npm test
```

Build the app:

```bash
npm run build
```

## Packaging

Build the official Windows installer:

```bash
npm run dist
```

Build a local portable zip that avoids code-signing resource downloads:

```bash
npm run dist:release
```

The portable zip is written to:

```text
release/Tempo-<version>-win-unpacked.zip
```

## GitHub Release Flow

This repository includes GitHub Actions for CI and releases.

Create and push a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions will build the Windows app, create a release, and upload downloadable assets.

## License

MIT
