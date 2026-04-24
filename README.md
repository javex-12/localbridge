# 🔗 LocalBridge

Cross-device, fully offline, peer-to-peer file transfer. No internet needed.

## 🚀 Quick Start

### 1. Prerequisites
- Rust (latest stable)
- Node.js & npm
- C++ Build Tools (Windows)

### 2. Install Dependencies
```bash
npm install
```

### 3. Run in Development
```bash
npm run tauri dev
```

### 4. Build for Production
```bash
npm run tauri build
```

## 📱 Mobile PWA
To use on your phone:
1. Ensure your laptop and phone are on the same Wi-Fi (or connect to the laptop's auto-created hotspot).
2. Open the Laptop App.
3. Scan the QR code shown on the laptop with your phone's camera.
4. The PWA will load and allow you to browse and transfer files.

## 🛠 Tech Stack
- **Backend:** Rust, Axum, Tauri v2
- **Frontend:** Vanilla HTML/JS/CSS
- **PWA:** Service Workers, jsQR for scanning
- **Networking:** Direct TCP/WebSockets over local network

## 🔒 Security
- Cryptographically random tokens per session.
- Single-device connection lock.
- Zero data leaves your local network.
