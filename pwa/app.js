/* ── Global State ────────────────────────────────────────── */
const state = {
    currentPath: localStorage.getItem('lastPath') || '/',
    token: localStorage.getItem('connectionToken') || '',
    laptopIp: window.location.hostname || localStorage.getItem('laptopIp') || '',
    currentItems: [],
    currentPane: 'home',
    searchTimer: null,
    scanTimer: null,
    uploads: new Map(),
    isConnected: false
};

/* ── UI Elements ──────────────────────────────────────────── */
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
    btnBackDir:           document.getElementById('btn-back-dir'),
    btnUpload:            document.getElementById('btn-upload-pro'),
    btnScanStart:         document.getElementById('btn-scan-start'),
    btnCloseScanner:      document.getElementById('btn-close-scanner'),
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

/* ── Lifecycle ────────────────────────────────────────────── */
async function init() {
    console.log("LocalBridge: Booting Engine...");
    
    // Auto-detect IP from URL if hosted on the laptop
    if (window.location.port === "3000") {
        state.laptopIp = window.location.hostname;
        localStorage.setItem('laptopIp', state.laptopIp);
    }

    setupListeners();
    
    if (state.laptopIp && state.token) {
        const ok = await loadFiles(state.currentPath);
        updateStatusUI(ok);
        if (ok) setPane('browse');
    } else {
        setPane('home');
        updateStatusUI(false);
    }
}

function setupListeners() {
    dom.dockItems.forEach(item => {
        item.addEventListener('click', () => setPane(item.dataset.pane));
    });

    const openScannerBtn = document.querySelector('[data-open-scanner]');
    if (openScannerBtn) openScannerBtn.addEventListener('click', showScanner);
    
    if (dom.btnScanStart) dom.btnScanStart.addEventListener('click', startScanner);
    if (dom.btnCloseScanner) dom.btnCloseScanner.addEventListener('click', hideScanner);

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

function updateStatusUI(connected) {
    state.isConnected = connected;
    const dash = dom.dashboardConnect;
    if (!dash) return;

    if (connected) {
        dash.innerHTML = `
            <div class="flex-1">
                <h4 class="font-extrabold text-white text-sm uppercase tracking-wider mb-1">Bridge Linked</h4>
                <p class="text-[11px] text-blue-400 font-bold italic truncate">${state.laptopIp}</p>
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
        if (dom.statusDot) dom.statusDot.className = 'status-dot';
        if (dom.sessionLabel) dom.sessionLabel.textContent = '○ Offline';
    }
    if (window.lucide) lucide.createIcons();
}

/* ── Pane Engine ─────────────────────────────────────────── */
function setPane(name) {
    state.currentPane = name;
    Object.entries(dom.panes).forEach(([k, v]) => {
        if (v) v.classList.toggle('hidden', k !== name);
    });
    dom.dockItems.forEach(item => {
        item.classList.toggle('is-active', item.dataset.pane === name);
    });
}

function showScanner() {
    if (dom.connectScreen) dom.connectScreen.classList.remove('hidden');
    if (window.gsap) gsap.fromTo(dom.connectScreen, { opacity: 0, scale: 1.1 }, { opacity: 1, scale: 1, duration: 0.3 });
}

function hideScanner() {
    if (dom.connectScreen) dom.connectScreen.classList.add('hidden');
    stopScanner();
}

/* ── Camera Logic ────────────────────────────────────────── */
async function startScanner() {
    try {
        console.log("LocalBridge: Initializing Camera Stream...");
        const constraints = {
            video: { 
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (dom.scannerVideo) {
            dom.scannerVideo.srcObject = stream;
            await dom.scannerVideo.play();
        }
        
        if (dom.btnScanStart) {
            dom.btnScanStart.textContent = 'SCANNING FOR SIGNAL…';
            dom.btnScanStart.classList.add('opacity-50');
        }

        clearInterval(state.scanTimer);
        state.scanTimer = setInterval(processFrame, 250);
    } catch (err) {
        console.error("Camera Access Denied:", err);
        alert("Camera Error: Check Permissions or visit via HTTPS/Localhost.");
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
        console.log("LocalBridge: Handshake Detected!");
        clearInterval(state.scanTimer);
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        handlePairing(JSON.parse(code.data));
    }
}

function stopScanner() {
    clearInterval(state.scanTimer);
    if (dom.scannerVideo && dom.scannerVideo.srcObject) {
        dom.scannerVideo.srcObject.getTracks().forEach(t => t.stop());
        dom.scannerVideo.srcObject = null;
    }
    if (dom.btnScanStart) {
        dom.btnScanStart.textContent = 'Start Camera Scan';
        dom.btnScanStart.classList.remove('opacity-50');
    }
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
    } else {
        alert("Bridge Failed: IP unreachable.");
        startScanner();
    }
}

/* ── File Engine ─────────────────────────────────────────── */
async function loadFiles(path) {
    if (!state.laptopIp || !state.token) return false;
    
    state.currentPath = path;
    localStorage.setItem('lastPath', path);

    if (dom.currentPathMobile) dom.currentPathMobile.textContent = path === '/' ? '/ROOT' : path;
    if (dom.currentDirLabel) dom.currentDirLabel.textContent = path.split('/').filter(Boolean).pop() || 'Workstation';
    if (dom.btnBackDir) dom.btnBackDir.disabled = path === '/';

    if (dom.fileList) dom.fileList.innerHTML = `<div class="col-span-2 py-20 text-center text-slate-700 font-bold animate-pulse">Establishing Tunnel...</div>`;

    try {
        const url = `http://${state.laptopIp}:3000/api/files?path=${encodeURIComponent(path)}&token=${state.token}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Auth Failed");
        
        const files = await res.json();
        state.currentItems = files.sort((a, b) => (a.kind === 'folder' ? -1 : 1));
        renderFileList(state.currentItems);
        return true;
    } catch (err) {
        console.error("Tunnel Error:", err);
        if (dom.browserEmpty) dom.browserEmpty.classList.remove('hidden');
        if (dom.fileList) dom.fileList.innerHTML = '';
        return false;
    }
}

function renderFileList(files) {
    if (!dom.fileList) return;
    dom.fileList.innerHTML = '';
    
    if (dom.browserEmpty) dom.browserEmpty.classList.toggle('hidden', files.length > 0);
    if (dom.browseCount) dom.browseCount.textContent = `${files.length} ITEMS`;

    files.forEach((file) => {
        const card = document.createElement('button');
        card.className = 'glass-card p-5 rounded-[32px] text-left flex flex-col gap-4 group active:scale-95 transition-all';
        const color = getKindColor(file.kind);
        
        card.innerHTML = `
            <div class="file-icon w-12 h-12 rounded-2xl flex items-center justify-center bg-${color}-600/10 text-${color}-500 group-active:bg-${color}-600 group-active:text-white transition-all border border-${color}-500/10">
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
    if (window.lucide) lucide.createIcons();
}

/* ── Transfer Logic ──────────────────────────────────────── */
async function handleFileUpload(files) {
    if (!files.length || !state.isConnected) return;
    setPane('transfers');
    
    for (const file of files) {
        const id = `up-${Date.now()}`;
        const formData = new FormData();
        formData.append('file', file);

        updateTransfer(id, { name: file.name, status: 'sending', progress: 0 });

        const xhr = new XMLHttpRequest();
        const url = `http://${state.laptopIp}:3000/api/upload?path=${encodeURIComponent(state.currentPath)}&token=${state.token}`;
        xhr.open('POST', url);

        xhr.upload.onprogress = (e) => {
            const p = Math.round((e.loaded / e.total) * 100);
            updateTransfer(id, { progress: p });
            showToast(`Uploading ${file.name}...`, p);
        };

        xhr.onload = () => {
            const ok = xhr.status === 200;
            updateTransfer(id, { status: ok ? 'done' : 'failed', progress: 100 });
            if (ok) loadFiles(state.currentPath);
        };

        xhr.send(formData);
    }
}

function updateTransfer(id, data) {
    const existing = state.uploads.get(id) || { id, name: '', status: 'queued', progress: 0 };
    state.uploads.set(id, { ...existing, ...data });
    renderTransfers();
}

function renderTransfers() {
    const list = dom.mobileTransferList;
    if (!list) return;
    
    const items = Array.from(state.uploads.values()).reverse();
    if (dom.transferCountMobile) dom.transferCountMobile.textContent = `${items.length} ACTIVE`;

    if (items.length === 0) {
        list.innerHTML = `<div class="py-20 text-center opacity-20"><i data-lucide="satellite" class="w-12 h-12 mx-auto mb-4"></i><p class="text-xs font-bold uppercase">No Traffic</p></div>`;
    } else {
        list.innerHTML = items.map(i => `
            <div class="glass-card p-5 rounded-[32px] flex items-center gap-5">
                <div class="w-12 h-12 rounded-2xl bg-blue-600/10 text-blue-500 flex items-center justify-center">
                    <i data-lucide="${i.status === 'done' ? 'check' : 'arrow-up-circle'}" class="w-6 h-6"></i>
                </div>
                <div class="flex-1">
                    <div class="flex justify-between mb-2">
                        <span class="text-[11px] font-extrabold text-white uppercase italic truncate mr-4">${i.name}</span>
                        <span class="text-[9px] font-black uppercase text-blue-500">${i.status}</span>
                    </div>
                    <div class="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div class="h-full bg-blue-500" style="width: ${i.progress}%"></div>
                    </div>
                </div>
            </div>
        `).join('');
    }
    if (window.lucide) lucide.createIcons();
}

/* ── Helpers ─────────────────────────────────────────────── */
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
function showToast(msg, p) {
    if (!dom.uploadToast) return;
    dom.uploadToastLabel.textContent = msg;
    dom.uploadToastFill.style.width = `${p}%`;
    dom.uploadToast.classList.remove('opacity-0', 'translate-y-20');
    if (p === 100) setTimeout(() => dom.uploadToast.classList.add('opacity-0', 'translate-y-20'), 3000);
}

window.addEventListener('load', init);