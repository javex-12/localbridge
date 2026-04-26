/* ── State ────────────────────────────────────────────────── */
const state = {
    currentPath: localStorage.getItem('lastPath') || '/',
    token: localStorage.getItem('connectionToken') || '',
    laptopIp: localStorage.getItem('laptopIp') || '',
    currentItems: [],
    currentPane: 'home',
    searchTimer: null,
    thumbVersion: 0,
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
    btnBackDir:           document.getElementById('btn-back-dir'),
    btnUpload:            document.getElementById('btn-upload-pro'),
    btnScanStart:         document.getElementById('btn-scan-start'),
    btnCloseScanner:      document.getElementById('btn-close-scanner'),
    btnRescan:            document.getElementById('btn-rescan'),
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
    dashboardConnect:     document.getElementById('dashboard-connect'),
    btnOpenScanner:       document.getElementById('btn-open-scanner')
};

/* ── Init ─────────────────────────────────────────────────── */
async function init() {
    console.log("LocalBridge: Initializing Core...");
    
    // Register SW for offline
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    setupEventListeners();
    
    // Auto-reconnect
    if (state.laptopIp && state.token) {
        console.log("LocalBridge: Attempting auto-reconnect to", state.laptopIp);
        const success = await loadRemoteFiles(state.currentPath);
        updateConnectionUI(success);
        if (success) setPane('browse');
    } else {
        setPane('home');
        updateConnectionUI(false);
    }
}

function setupEventListeners() {
    dom.dockItems.forEach(item => {
        item.addEventListener('click', () => setPane(item.dataset.pane));
    });

    if (dom.btnOpenScanner) dom.btnOpenScanner.addEventListener('click', showScannerOverlay);
    if (dom.btnScanStart) dom.btnScanStart.addEventListener('click', startScan);
    if (dom.btnCloseScanner) dom.btnCloseScanner.addEventListener('click', hideScannerOverlay);

    if (dom.btnBackDir) {
        dom.btnBackDir.addEventListener('click', () => {
            if (!isRootPath(state.currentPath)) {
                loadRemoteFiles(parentPath(state.currentPath));
            }
        });
    }

    if (dom.mobileSearch) {
        dom.mobileSearch.addEventListener('input', () => {
            clearTimeout(state.searchTimer);
            state.searchTimer = setTimeout(() => renderFiles(filterCurrentItems()), 100);
        });
    }

    if (dom.btnUpload) dom.btnUpload.addEventListener('click', () => dom.fileInput.click());
    if (dom.fileInput) dom.fileInput.addEventListener('change', () => uploadFiles([...dom.fileInput.files]));

    document.querySelectorAll('.category-card').forEach(card => {
        card.addEventListener('click', () => {
            if (!state.isConnected) {
                showScannerOverlay();
                return;
            }
            const type = card.getAttribute('data-pick');
            dom.fileInput.accept = type === '*' ? '' : type;
            dom.fileInput.click();
        });
    });

    if (dom.btnRescan) dom.btnRescan.addEventListener('click', resetSession);
}

function updateConnectionUI(connected) {
    state.isConnected = connected;
    if (connected) {
        if (dom.dashboardConnect) {
            dom.dashboardConnect.innerHTML = `
                <div class="flex-1">
                    <h4 class="font-extrabold text-white text-sm uppercase tracking-wider mb-1">Bridge Active</h4>
                    <p class="text-[11px] text-blue-400 font-bold italic truncate">${state.laptopIp}</p>
                </div>
                <div class="w-12 h-12 rounded-2xl bg-blue-600/20 text-blue-500 border border-blue-500/20 flex items-center justify-center">
                    <i data-lucide="zap" class="w-6 h-6"></i>
                </div>
            `;
        }
        if (dom.settingsHost) dom.settingsHost.textContent = state.laptopIp;
        if (dom.sessionLabel) {
            dom.sessionLabel.textContent = '● Online';
            dom.sessionLabel.className = 'text-[10px] font-bold uppercase tracking-widest text-blue-500 italic';
        }
        if (dom.statusDot) dom.statusDot.className = 'status-dot active';
    } else {
        if (dom.dashboardConnect) {
            dom.dashboardConnect.innerHTML = `
                <div class="flex-1">
                    <h4 class="font-extrabold text-white text-sm uppercase tracking-wider mb-1">Disconnected</h4>
                    <p class="text-[11px] text-slate-400 font-medium">Link with workstation to start.</p>
                </div>
                <button id="btn-manual-link" class="px-4 py-2 rounded-xl bg-slate-800 text-blue-500 text-[10px] font-black uppercase tracking-widest border border-white/5">Manual</button>
                <button id="btn-re-scan" class="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg active:scale-90 transition-transform ml-2">
                    <i data-lucide="qr-code" class="w-6 h-6"></i>
                </button>
            `;
            document.getElementById('btn-re-scan').addEventListener('click', showScannerOverlay);
            document.getElementById('btn-manual-link').addEventListener('click', promptManualLink);
        }
        if (dom.settingsHost) dom.settingsHost.textContent = '--';
        if (dom.sessionLabel) {
            dom.sessionLabel.textContent = '○ Offline';
            dom.sessionLabel.className = 'text-[10px] font-bold uppercase tracking-widest text-slate-500 italic';
        }
        if (dom.statusDot) dom.statusDot.className = 'status-dot';
    }
    if (window.lucide) lucide.createIcons();
}

function promptManualLink() {
    const ip = prompt("Enter Workstation IP (e.g. 192.168.1.5):", state.laptopIp);
    const token = prompt("Enter Security Token:", state.token);
    if (ip && token) {
        handleHandshake({ ip, token });
    }
}

/* ── Pane switching ───────────────────────────────────────── */
function setPane(paneName) {
    state.currentPane = paneName;
    Object.entries(dom.panes).forEach(([name, pane]) => {
        if (pane) pane.classList.toggle('hidden', name !== paneName);
    });
    dom.dockItems.forEach((item) => {
        item.classList.toggle('is-active', item.dataset.pane === paneName);
    });
}

function showScannerOverlay() {
    if (!dom.connectScreen) return;
    dom.connectScreen.classList.remove('hidden');
    if (window.gsap) {
        gsap.fromTo(dom.connectScreen, { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.4 });
    }
}

function hideScannerOverlay() {
    if (!dom.connectScreen) return;
    dom.connectScreen.classList.add('hidden');
    stopScanner();
}

/* ── QR Scanner ───────────────────────────────────────────── */
async function startScan() {
    try {
        console.log("LocalBridge: Requesting Camera...");
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });

        if (dom.scannerVideo) {
            dom.scannerVideo.srcObject = stream;
            await dom.scannerVideo.play();
        }

        if (dom.btnScanStart) {
            dom.btnScanStart.textContent = 'SYSTEM ACTIVE…';
            dom.btnScanStart.disabled = true;
        }

        clearInterval(state.scanTimer);
        state.scanTimer = setInterval(readQrFrame, 200);
    } catch (err) {
        console.error("Camera Error:", err);
        alert(`Camera restricted: ${err.name}. Try Manual Link.`);
        if (dom.btnScanStart) dom.btnScanStart.disabled = false;
    }
}

function readQrFrame() {
    if (!dom.scannerVideo || dom.scannerVideo.readyState !== dom.scannerVideo.HAVE_ENOUGH_DATA) return;

    dom.scannerCanvas.width  = dom.scannerVideo.videoWidth;
    dom.scannerCanvas.height = dom.scannerVideo.videoHeight;
    const ctx = dom.scannerCanvas.getContext('2d');
    ctx.drawImage(dom.scannerVideo, 0, 0);
    const img  = ctx.getImageData(0, 0, dom.scannerCanvas.width, dom.scannerCanvas.height);
    const code = window.jsQR ? jsQR(img.data, img.width, img.height) : null;

    if (code) {
        clearInterval(state.scanTimer);
        try {
            handleHandshake(JSON.parse(code.data));
        } catch (e) {
            console.error("Invalid QR:", e);
            startScan(); 
        }
    }
}

function stopScanner() {
    clearInterval(state.scanTimer);
    if (dom.scannerVideo && dom.scannerVideo.srcObject) {
        dom.scannerVideo.srcObject.getTracks().forEach((t) => t.stop());
        dom.scannerVideo.srcObject = null;
    }
    if (dom.btnScanStart) {
        dom.btnScanStart.textContent = 'Initialize Scanner';
        dom.btnScanStart.disabled = false;
    }
}

/* ── Handshake ────────────────────────────────────────────── */
async function handleHandshake(payload) {
    state.laptopIp = payload.ip;
    state.token = payload.token;
    
    localStorage.setItem('laptopIp', state.laptopIp);
    localStorage.setItem('connectionToken', state.token);

    const success = await loadRemoteFiles('/');
    updateConnectionUI(success);
    
    if (success) {
        hideScannerOverlay();
        setPane('browse');
    } else {
        alert("Connection failed. Check IP and Token.");
    }
}

/* ── File loading ─────────────────────────────────────────── */
async function loadRemoteFiles(path) {
    if (!state.laptopIp || !state.token) return false;
    
    state.currentPath = path;
    localStorage.setItem('lastPath', path);

    if (dom.currentPathMobile) dom.currentPathMobile.textContent = shorten(path);
    if (dom.currentDirLabel) dom.currentDirLabel.textContent   = basename(path) || 'Workstation';
    if (dom.settingsFolder) dom.settingsFolder.textContent    = path;
    if (dom.btnBackDir) dom.btnBackDir.disabled           = isRootPath(path);

    if (dom.fileList) {
        dom.fileList.innerHTML = `<div class="col-span-2 py-20 text-center text-slate-600 font-bold uppercase tracking-widest animate-pulse">Establishing Tunnel...</div>`;
    }

    try {
        const url = `http://${state.laptopIp}:3000/api/files?path=${encodeURIComponent(path)}&token=${state.token}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Unauthorized');
        
        const files = await res.json();
        state.currentItems = sortFiles(files);
        renderFiles(state.currentItems);
        return true;
    } catch (err) {
        console.error("Fetch Error:", err);
        if (dom.fileList) dom.fileList.innerHTML = '';
        if (dom.browserEmpty) dom.browserEmpty.classList.remove('hidden');
        return false;
    }
}

function sortFiles(files) {
    return [...files].sort((a, b) => {
        if (a.kind === 'folder' && b.kind !== 'folder') return -1;
        if (a.kind !== 'folder' && b.kind === 'folder') return 1;
        return a.name.localeCompare(b.name);
    });
}

function filterCurrentItems() {
    const q = dom.mobileSearch ? dom.mobileSearch.value.trim().toLowerCase() : '';
    return q ? state.currentItems.filter((f) => f.name.toLowerCase().includes(q)) : state.currentItems;
}

function renderFiles(files) {
    if (!dom.fileList) return;
    dom.fileList.innerHTML = '';
    
    const showEmpty = files.length === 0;
    if (dom.browserEmpty) dom.browserEmpty.classList.toggle('hidden', !showEmpty);
    if (dom.browseCount) dom.browseCount.textContent = `${files.length} ITEMS`;

    if (showEmpty) return;

    const renderId = ++state.thumbVersion;

    files.forEach((file, i) => {
        const card = document.createElement('button');
        card.className = 'glass-card p-5 rounded-[32px] text-left flex flex-col gap-4 group';
        
        const iconColor = getIconColor(file.kind);

        card.innerHTML = `
            <div class="file-cell-icon w-12 h-12 rounded-2xl flex items-center justify-center bg-${iconColor}-600/10 text-${iconColor}-500 group-active:bg-${iconColor}-600 group-active:text-white transition-all border border-${iconColor}-500/10">
                ${getFileIcon(file.kind)}
            </div>
            <div class="min-w-0">
                <div class="text-[11px] font-extrabold text-white truncate mb-1 uppercase tracking-wide italic">${escapeHtml(file.name)}</div>
                <div class="text-[9px] font-bold text-slate-500 uppercase tracking-widest">${file.kind === 'folder' ? 'Folder' : formatSize(file.size)}</div>
            </div>
        `;
        card.addEventListener('click', () => handleFileTap(file));
        dom.fileList.appendChild(card);

        if (file.kind === 'image') hydrateThumbnail(file, card, renderId);
    });
    if (window.lucide) lucide.createIcons();
}

function getIconColor(kind) {
    switch (kind) {
        case 'folder': return 'blue';
        case 'image': return 'indigo';
        case 'video': return 'rose';
        case 'audio': return 'emerald';
        default: return 'slate';
    }
}

async function hydrateThumbnail(file, card, renderId) {
    try {
        const url = `http://${state.laptopIp}:3000/api/thumbnail?path=${encodeURIComponent(file.path)}&token=${state.token}`;
        const res = await fetch(url);
        if (!res.ok || renderId !== state.thumbVersion) return;
        const payload = await res.json();
        if (payload.thumbnail) {
            const icon = card.querySelector('.file-cell-icon');
            if (icon) {
                icon.innerHTML = `<img src="data:image/jpeg;base64,${payload.thumbnail}" class="w-full h-full object-cover rounded-[14px]">`;
                icon.className = "file-cell-icon w-full aspect-square rounded-[22px] flex items-center justify-center bg-black/20 overflow-hidden border border-white/5";
            }
        }
    } catch (e) {}
}

function handleFileTap(file) {
    if (file.kind === 'folder') {
        loadRemoteFiles(file.path);
    } else {
        const url = `http://${state.laptopIp}:3000/api/file?path=${encodeURIComponent(file.path)}&token=${state.token}`;
        window.open(url, '_blank');
    }
}

/* ── Transfers ────────────────────────────────────────────── */
function recordTransfer(entry) {
    const existing = state.uploads.get(entry.id) || {};
    state.uploads.set(entry.id, { ...existing, ...entry, updatedAt: Date.now() });
    renderTransfers();
}

function renderTransfers() {
    const items = [...state.uploads.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    if (dom.transferCountMobile) dom.transferCountMobile.textContent = `${items.length} ACTIVE`;

    if (items.length === 0) {
        if (dom.mobileTransferList) {
            dom.mobileTransferList.innerHTML = `<div class="py-20 flex flex-col items-center justify-center text-center opacity-20"><i data-lucide="satellite" class="w-12 h-12 text-slate-400 mb-6"></i><p class="text-xs font-bold uppercase tracking-widest">No Traffic</p></div>`;
            if (window.lucide) lucide.createIcons();
        }
        return;
    }

    if (dom.mobileTransferList) {
        dom.mobileTransferList.innerHTML = items.map((item) => {
            const pct = item.total ? Math.round((item.transferred / item.total) * 100) : 0;
            const isDone = item.status === 'done';
            return `
                <article class="glass-card p-5 rounded-[32px] flex items-center gap-5">
                    <div class="w-12 h-12 rounded-[20px] ${isDone ? 'bg-blue-600 text-white' : 'bg-blue-600/10 text-blue-500'} flex items-center justify-center">
                        <i data-lucide="${isDone ? 'check' : 'arrow-up-circle'}" class="w-6 h-6"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-center mb-2">
                            <div class="text-[11px] font-extrabold text-white truncate mr-4 uppercase tracking-wider italic">${escapeHtml(item.name)}</div>
                            <span class="text-[9px] font-extrabold uppercase tracking-widest ${isDone ? 'text-blue-500' : 'text-blue-400'}">${item.status}</span>
                        </div>
                        <div class="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                            <div class="h-full bg-blue-500 transition-all duration-300" style="width:${pct}%"></div>
                        </div>
                    </div>
                </article>`;
        }).join('');
        if (window.lucide) lucide.createIcons();
    }
}

async function uploadFiles(files) {
    if (!files.length || !state.isConnected) return;
    setPane('transfers');
    for (const file of files) await uploadSingleFile(file);
    dom.fileInput.value = '';
    hideToast();
    loadRemoteFiles(state.currentPath);
}

function uploadSingleFile(file) {
    return new Promise((resolve) => {
        const id = `upload-${file.name}-${Date.now()}`;
        const formData = new FormData();
        formData.append('file', file, file.name);

        recordTransfer({ id, name: file.name, status: 'uploading', transferred: 0, total: file.size });
        showToast(file.name, 0);

        const xhr = new XMLHttpRequest();
        const url = `http://${state.laptopIp}:3000/api/upload?path=${encodeURIComponent(state.currentPath)}&token=${state.token}`;
        xhr.open('POST', url);

        xhr.upload.onprogress = (e) => {
            const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
            recordTransfer({ id, name: file.name, status: 'uploading', transferred: e.loaded, total: e.total });
            showToast(file.name, pct);
        };

        xhr.onload = () => {
            const ok = xhr.status >= 200 && xhr.status < 300;
            recordTransfer({ id, name: file.name, status: ok ? 'done' : 'failed', transferred: file.size, total: file.size });
            showToast(file.name, ok ? 100 : 0);
            resolve();
        };

        xhr.onerror = () => {
            recordTransfer({ id, name: file.name, status: 'failed', transferred: 0, total: file.size });
            resolve();
        };

        xhr.send(formData);
    });
}

function showToast(name, pct) {
    if (!dom.uploadToast) return;
    dom.uploadToastLabel.textContent = pct === 100 ? `SYNC COMPLETE` : `SYNCING: ${pct}%`;
    dom.uploadToastFill.style.width = `${pct}%`;
    dom.uploadToast.classList.remove('opacity-0', 'translate-y-20');
    if (pct === 100) setTimeout(hideToast, 3000);
}

function hideToast() { 
    if (dom.uploadToast) dom.uploadToast.classList.add('opacity-0', 'translate-y-20');
}

function resetSession() {
    localStorage.clear();
    location.reload();
}

/* ── Helpers ──────────────────────────────────────────────── */
function getFileIcon(kind) {
    const icons = {
        folder:   'folder',
        image:    'image',
        video:    'clapperboard',
        audio:    'waveform',
        archive:  'archive',
        document: 'files',
        file:     'file',
    };
    const icon = icons[kind] || icons.file;
    return `<i data-lucide="${icon}" class="w-5 h-5"></i>`;
}

function formatSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B','KB','MB','GB'];
    let v = bytes, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(1)} ${units[i]}`;
}

function escapeHtml(v) { return String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function basename(path) { return path.split(/[\/]/).filter(Boolean).pop() || ''; }
function shorten(path) { return path.length > 20 ? '...' + path.slice(-17) : path; }
function parentPath(path) { 
    const p = path.split(/[\/]/).filter(Boolean);
    p.pop();
    return p.length === 0 ? '/' : '/' + p.join('/');
}
function isRootPath(path) { return path === '/' || !path || path.endsWith(':'); }

window.addEventListener('load', init);