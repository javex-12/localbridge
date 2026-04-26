/* ── Global State ────────────────────────────────────────── */
const state = {
    currentPath: localStorage.getItem('lastPath') || '/',
    token: localStorage.getItem('connectionToken') || '',
    laptopIp: window.location.hostname || localStorage.getItem('laptopIp') || '',
    currentItems: [],
    currentPane: 'home',
    scanTimer: null,
    uploads: new Map(),
    isConnected: false
};

/* ── DOM refs ─────────────────────────────────────────────── */
const dom = {
    connectScreen:        document.getElementById('connect-screen'),
    fileList:             document.getElementById('file-list'),
    browseCount:          document.getElementById('browse-count'),
    currentDirLabel:      document.getElementById('current-dir-label'),
    sessionLabel:         document.getElementById('session-label'),
    statusDot:            document.getElementById('status-dot'),
    currentPathMobile:    document.getElementById('current-path-mobile'),
    browserEmpty:         document.getElementById('browser-empty'),
    mobileSearch:         document.getElementById('mobile-search'),
    transferCountMobile:  document.getElementById('transfer-count-mobile'),
    mobileTransferList:   document.getElementById('mobile-transfer-list'),
    settingsHost:         document.getElementById('settings-host'),
    settingsFolder:       document.getElementById('settings-folder'),
    manualIp:             document.getElementById('manual-ip'),
    manualToken:          document.getElementById('manual-token'),
    btnManualLink:        document.getElementById('btn-manual-link'),
    btnRescan:            document.getElementById('btn-rescan'),
    btnBackDir:           document.getElementById('btn-back-dir'),
    btnUpload:            document.getElementById('btn-upload-pro'),
    btnScanStart:         document.getElementById('btn-scan-start'),
    btnCloseScanner:      document.getElementById('btn-close-scanner'),
    btnShowCode:          document.getElementById('btn-show-code-input'),
    btnCloseCode:         document.getElementById('btn-close-code'),
    btnVerifyCode:        document.getElementById('btn-verify-code'),
    codeScreen:           document.getElementById('code-screen'),
    codeInputs:           document.querySelectorAll('.code-input'),
    pairingStatus:        document.getElementById('pairing-status'),
    fileInput:            document.getElementById('file-input'),
    scannerVideo:         document.getElementById('scanner-video'),
    scannerCanvas:        document.getElementById('scanner-canvas'),
    uploadToast:          document.getElementById('upload-toast'),
    uploadToastLabel:     document.getElementById('upload-toast-label'),
    uploadToastFill:      document.getElementById('upload-toast-fill'),
    dockItems:            document.querySelectorAll('.dock-item'),
    panes: {
        home:      document.getElementById('home-pane'),
        browse:    document.getElementById('browse-pane'),
        transfers: document.getElementById('transfers-pane'),
        settings:  document.getElementById('settings-pane'),
    },
    dashboardConnect:     document.getElementById('dashboard-connect')
};

/* ── Init ─────────────────────────────────────────────────── */
async function init() {
    console.log("LocalBridge: Booting Engine...");
    
    // Auto-reconnect if hosted on laptop or from localStorage
    if (window.location.port === "3000") {
        state.laptopIp = window.location.hostname;
    } else {
        state.laptopIp = localStorage.getItem('laptopIp') || '';
    }
    state.token = localStorage.getItem('connectionToken') || '';

    setupListeners();
    refreshIcons();
    
    if (state.laptopIp && state.token) {
        const ok = await loadFiles(state.currentPath);
        updateStatusUI(ok);
        if (ok) {
            setPane('browse');
        } else {
            setPane('home');
        }
    } else {
        setPane('home');
        updateStatusUI(false);
    }
}

function setupListeners() {
    dom.dockItems.forEach(item => {
        item.addEventListener('click', () => setPane(item.dataset.pane));
    });

    if (dom.btnScanStart) dom.btnScanStart.addEventListener('click', startScanner);
    if (dom.btnCloseScanner) dom.btnCloseScanner.addEventListener('click', hideScanner);

    if (dom.btnShowCode) {
        dom.btnShowCode.addEventListener('click', () => {
            dom.connectScreen.classList.add('hidden');
            dom.codeScreen.classList.remove('hidden');
            dom.codeInputs[0].focus();
        });
    }

    if (dom.btnCloseCode) {
        dom.btnCloseCode.addEventListener('click', () => {
            dom.codeScreen.classList.add('hidden');
            dom.connectScreen.classList.remove('hidden');
        });
    }

    if (dom.btnVerifyCode) {
        dom.btnVerifyCode.addEventListener('click', () => {
            const code = Array.from(dom.codeInputs).map(i => i.value).join('');
            if (code.length === 6) {
                startDiscovery(code);
            }
        });
    }

    dom.codeInputs.forEach((input, idx) => {
        input.addEventListener('input', (e) => {
            if (e.target.value && idx < dom.codeInputs.length - 1) {
                dom.codeInputs[idx + 1].focus();
            }
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && idx > 0) {
                dom.codeInputs[idx - 1].focus();
            }
        });
    });

    if (dom.btnBackDir) {
        dom.btnBackDir.addEventListener('click', () => {
            if (state.currentPath !== '/') {
                const parts = state.currentPath.split('/').filter(Boolean);
                parts.pop();
                loadFiles('/' + parts.join('/'));
            }
        });
    }

    if (dom.mobileSearch) {
        dom.mobileSearch.addEventListener('input', () => {
            const q = dom.mobileSearch.value.toLowerCase();
            const filtered = state.currentItems.filter(f => f.name.toLowerCase().includes(q));
            renderFileList(filtered);
        });
    }

    if (dom.btnManualLink) {
        dom.btnManualLink.addEventListener('click', () => {
            const ip = dom.manualIp.value.trim();
            const token = dom.manualToken.value.trim();
            if (ip && token) {
                handlePairing({ ip, token });
            }
        });
    }

    if (dom.btnRescan) {
        dom.btnRescan.addEventListener('click', () => {
            localStorage.clear();
            location.reload();
        });
    }

    if (dom.btnUpload) dom.btnUpload.addEventListener('click', () => dom.fileInput.click());
    if (dom.fileInput) dom.fileInput.addEventListener('change', (e) => handleFileUpload(e.target.files));

    document.querySelectorAll('.category-card').forEach(card => {
        card.addEventListener('click', () => {
            if (!state.isConnected) return showScanner();
            dom.fileInput.accept = card.dataset.pick === '*' ? '' : card.dataset.pick;
            dom.fileInput.click();
        });
    });
}

function refreshIcons() {
    if (window.lucide) {
        lucide.createIcons();
    }
}

function updateStatusUI(connected) {
    state.isConnected = connected;
    const dash = dom.dashboardConnect;
    if (!dash) return;

    const displayIp = state.laptopIp || localStorage.getItem('laptopIp') || 'Discovery Mode';

    if (connected) {
        dash.innerHTML = `
            <div class="flex-1">
                <h4 class="font-extrabold text-white text-sm uppercase tracking-wider mb-1">Bridge Linked</h4>
                <p class="text-[11px] text-blue-400 font-bold italic truncate">${displayIp}</p>
            </div>
            <div class="w-12 h-12 rounded-2xl bg-blue-600/20 text-blue-500 border border-blue-500/20 flex items-center justify-center">
                <i data-lucide="zap" class="w-6 h-6"></i>
            </div>
        `;
        if (dom.statusDot) dom.statusDot.className = 'status-dot active';
        if (dom.sessionLabel) dom.sessionLabel.textContent = '● Native Link';
    } else {
        dash.innerHTML = `
            <div class="flex-1">
                <h4 class="font-extrabold text-white text-sm uppercase tracking-wider mb-1">System Idle</h4>
                <p class="text-[11px] text-slate-400 font-medium italic">Awaiting handshake...</p>
            </div>
            <button onclick="showScanner()" class="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform">
                <i data-lucide="qr-code" class="w-6 h-6"></i>
            </button>
        `;
    }
    refreshIcons();
}

function setPane(name) {
    state.currentPane = name;
    Object.entries(dom.panes).forEach(([k, v]) => {
        if (v) v.classList.toggle('hidden', k !== name);
    });
    dom.dockItems.forEach(item => {
        item.classList.toggle('is-active', item.dataset.pane === name);
    });
    refreshIcons();
}

window.showScanner = showScanner;
window.setPane = setPane;

function showScanner() {
    if (dom.connectScreen) dom.connectScreen.classList.remove('hidden');
}

function hideScanner() {
    if (dom.connectScreen) dom.connectScreen.classList.add('hidden');
    stopScanner();
}

async function startScanner() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 } }
        });
        if (dom.scannerVideo) {
            dom.scannerVideo.srcObject = stream;
            await dom.scannerVideo.play();
        }
        clearInterval(state.scanTimer);
        state.scanTimer = setInterval(processFrame, 250);
        if (dom.btnScanStart) dom.btnScanStart.textContent = 'SCANNING...';
    } catch (err) {
        alert("Camera restricted. Enter IP/Token in Settings.");
        setPane('settings');
        hideScanner();
    }
}

function processFrame() {
    if (!dom.scannerVideo || dom.scannerVideo.readyState !== dom.scannerVideo.HAVE_ENOUGH_DATA) return;
    const canvas = dom.scannerCanvas;
    canvas.width = dom.scannerVideo.videoWidth;
    canvas.height = dom.scannerVideo.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(dom.scannerVideo, 0, 0);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = window.jsQR ? jsQR(img.data, img.width, img.height) : null;
    if (code) {
        clearInterval(state.scanTimer);
        handlePairing(JSON.parse(code.data));
    }
}

function stopScanner() {
    clearInterval(state.scanTimer);
    if (dom.scannerVideo && dom.scannerVideo.srcObject) {
        dom.scannerVideo.srcObject.getTracks().forEach(t => t.stop());
        dom.scannerVideo.srcObject = null;
    }
    if (dom.btnScanStart) dom.btnScanStart.textContent = 'Initialize Scanner';
}

async function startDiscovery(code) {
    dom.pairingStatus.textContent = "Broadcasting Signal...";
    dom.pairingStatus.style.opacity = "1";
    dom.btnVerifyCode.disabled = true;
    dom.btnVerifyCode.textContent = "SEARCHING...";

    // 0. Try current hostname first
    const currentHost = window.location.hostname;
    if (currentHost && currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
        const result = await tryIp(currentHost, code);
        if (result) {
            handlePairing(result);
            dom.codeScreen.classList.add('hidden');
            return;
        }
    }

    // 1. Try common subnets
    const subnets = ['192.168.1', '192.168.0', '192.168.43', '192.168.8', '172.20.10', '10.0.0'];
    
    // We'll also try to detect the phone's IP using WebRTC (classic trick)
    let localIpPrefix = null;
    try {
        const pc = new RTCPeerConnection({ iceServers: [] });
        pc.createDataChannel("");
        pc.createOffer().then(offer => pc.setLocalDescription(offer));
        pc.onicecandidate = (ice) => {
            if (ice && ice.candidate && ice.candidate.candidate) {
                const ip = ice.candidate.candidate.split(' ')[4];
                if (ip && ip.includes('.')) {
                    localIpPrefix = ip.split('.').slice(0, 3).join('.');
                }
            }
        };
    } catch (e) {}

    // Wait a bit for WebRTC to find something
    await new Promise(r => setTimeout(r, 500));
    if (localIpPrefix) subnets.unshift(localIpPrefix);

    let found = false;
    
    for (const subnet of subnets) {
        if (found) break;
        dom.pairingStatus.textContent = `Scanning ${subnet}.x...`;
        
        // Scan 254 IPs in chunks to avoid overwhelming the browser
        const chunkSize = 32;
        for (let i = 1; i < 255; i += chunkSize) {
            if (found) break;
            const promises = [];
            for (let j = 0; j < chunkSize && (i + j) < 255; j++) {
                const ip = `${subnet}.${i + j}`;
                promises.push(tryIp(ip, code));
            }
            const results = await Promise.all(promises);
            const winner = results.find(r => r);
            if (winner) {
                found = true;
                handlePairing(winner);
                dom.codeScreen.classList.add('hidden');
                break;
            }
        }
    }

    if (!found) {
        dom.pairingStatus.textContent = "Workstation Not Found";
        dom.btnVerifyCode.disabled = false;
        dom.btnVerifyCode.textContent = "LINK NOW";
    }
}

async function tryIp(ip, code) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1500); // 1.5s timeout per IP
    try {
        const res = await fetch(`http://${ip}:3000/api/verify-code?code=${code}`, {
            signal: controller.signal,
            mode: 'cors'
        });
        clearTimeout(id);
        if (res.ok) {
            return await res.json();
        }
    } catch (e) {
        clearTimeout(id);
    }
    return null;
}

async function handlePairing(data) {
    state.laptopIp = data.ip;
    state.token = data.token;
    localStorage.setItem('laptopIp', state.laptopIp);
    localStorage.setItem('connectionToken', state.token);
    const ok = await loadFiles('/');
    updateStatusUI(ok);
    if (ok) {
        hideScanner();
        setPane('browse');
    }
}

async function loadFiles(path) {
    if (!state.laptopIp || !state.token || state.laptopIp === 'Discovery Mode') return false;
    state.currentPath = path;
    try {
        const url = `http://${state.laptopIp}:3000/api/files?path=${encodeURIComponent(path)}&token=${state.token}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Sync Failed");
        
        const files = await res.json();
        state.currentItems = files.sort((a, b) => (a.kind === 'folder' ? -1 : 1));
        renderFileList(state.currentItems);
        
        if (dom.currentPathMobile) dom.currentPathMobile.textContent = path;
        if (dom.currentDirLabel) dom.currentDirLabel.textContent = path.split(/[\\/]/).filter(Boolean).pop() || 'Workstation';
        if (dom.btnBackDir) dom.btnBackDir.disabled = path === '/' || path === '';
        
        if (dom.browserEmpty) dom.browserEmpty.classList.toggle('hidden', state.currentItems.length > 0);
        
        return true;
    } catch (err) {
        console.error("Load Failed:", err);
        if (dom.browserEmpty) {
            dom.browserEmpty.classList.remove('hidden');
            const emptyLabel = dom.browserEmpty.querySelector('h3');
            if (emptyLabel) emptyLabel.textContent = "Workstation Offline";
        }
        return false;
    }
}

function renderFileList(files) {
    if (!dom.fileList) return;
    dom.fileList.innerHTML = '';
    files.forEach((file) => {
        const card = document.createElement('button');
        card.className = 'glass-card p-5 rounded-[32px] text-left flex flex-col gap-4 group';
        const color = getKindColor(file.kind);
        card.innerHTML = `
            <div class="w-12 h-12 rounded-2xl flex items-center justify-center bg-${color}-600/10 text-${color}-500 group-active:bg-${color}-600 group-active:text-white transition-all">
                <i data-lucide="${getKindIcon(file.kind)}" class="w-6 h-6"></i>
            </div>
            <div class="min-w-0">
                <div class="text-[11px] font-extrabold text-white truncate mb-1 uppercase tracking-wide italic">${file.name}</div>
                <div class="text-[9px] font-bold text-slate-500 uppercase tracking-widest">${file.kind === 'folder' ? 'Folder' : formatBytes(file.size)}</div>
            </div>
        `;
        card.addEventListener('click', () => {
            if (file.kind === 'folder') loadFiles(file.path);
            else window.open(`http://${state.laptopIp}:3000/api/file?path=${encodeURIComponent(file.path)}&token=${state.token}`, '_blank');
        });
        dom.fileList.appendChild(card);
    });
    refreshIcons();
}

function getKindIcon(k) {
    const map = { folder: 'folder', image: 'image', video: 'clapperboard', audio: 'waveform' };
    return map[k] || 'file';
}
function getKindColor(k) {
    const map = { folder: 'blue', image: 'indigo', video: 'rose', audio: 'emerald' };
    return map[k] || 'slate';
}
function formatBytes(b) {
    if (!b) return '0 B';
    const s = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(1) + ' ' + s[i];
}

async function handleFileUpload(files) {
    if (!files.length || !state.isConnected) return;
    setPane('transfers');
    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `http://${state.laptopIp}:3000/api/upload?path=${encodeURIComponent(state.currentPath)}&token=${state.token}`);
        xhr.onload = () => loadFiles(state.currentPath);
        xhr.send(formData);
    }
}

window.addEventListener('DOMContentLoaded', init);