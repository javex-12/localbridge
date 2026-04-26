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
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    setupEventListeners();
    
    // Auto-reconnect if we have saved credentials
    if (state.laptopIp && state.token) {
        updateConnectionUI(true);
        await loadRemoteFiles(state.currentPath);
    } else {
        setPane('home');
    }
}

function setupEventListeners() {
    // Navigation
    dom.dockItems.forEach(item => {
        item.addEventListener('click', () => setPane(item.dataset.pane));
    });

    // Scanner
    if (dom.btnOpenScanner) dom.btnOpenScanner.addEventListener('click', showScannerOverlay);
    if (dom.btnScanStart) dom.btnScanStart.addEventListener('click', startScan);
    if (dom.btnCloseScanner) dom.btnCloseScanner.addEventListener('click', hideScannerOverlay);

    // Browsing
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

    // Uploads
    if (dom.btnUpload) dom.btnUpload.addEventListener('click', () => dom.fileInput.click());
    if (dom.fileInput) dom.fileInput.addEventListener('change', () => uploadFiles([...dom.fileInput.files]));

    const categoryCards = document.querySelectorAll('.category-card');
    categoryCards.forEach(card => {
        card.addEventListener('click', () => {
            if (!state.token || !state.laptopIp) {
                showScannerOverlay();
                return;
            }
            const type = card.getAttribute('data-pick');
            dom.fileInput.accept = type === '*' ? '' : type;
            dom.fileInput.click();
        });
    });

    // Settings
    if (dom.btnRescan) dom.btnRescan.addEventListener('click', resetSession);
}

function updateConnectionUI(connected) {
    state.isConnected = connected;
    if (connected) {
        dom.dashboardConnect.innerHTML = `
            <div>
                <h4 class="font-extrabold text-white text-sm uppercase tracking-wider mb-1">Station Linked</h4>
                <p class="text-[11px] text-blue-400 font-bold tracking-tight italic">${state.laptopIp}</p>
            </div>
            <div class="w-12 h-12 rounded-2xl bg-blue-600/10 text-blue-500 border border-blue-500/20 flex items-center justify-center">
                <i data-lucide="check" class="w-6 h-6"></i>
            </div>
        `;
        dom.settingsHost.textContent = state.laptopIp;
        dom.sessionLabel.textContent = '● Connected';
        dom.sessionLabel.className = 'text-[10px] font-bold uppercase tracking-widest text-blue-500 italic';
        if (dom.statusDot) dom.statusDot.className = 'status-dot active';
    } else {
        dom.dashboardConnect.innerHTML = `
            <div>
                <h4 class="font-extrabold text-white text-sm uppercase tracking-wider mb-1">Bridge Link Idle</h4>
                <p class="text-[11px] text-slate-400 leading-relaxed font-medium">Scan to initiate native handshake.</p>
            </div>
            <button id="btn-open-scanner-new" class="w-12 h-12 rounded-2xl bg-slate-800 text-blue-500 flex items-center justify-center border border-white/5 active:scale-90 transition-transform">
                <i data-lucide="qr-code" class="w-6 h-6"></i>
            </button>
        `;
        const btnNew = document.getElementById('btn-open-scanner-new');
        if (btnNew) btnNew.addEventListener('click', showScannerOverlay);
        
        dom.settingsHost.textContent = '--';
        dom.sessionLabel.textContent = '○ Off-Air';
        dom.sessionLabel.className = 'text-[10px] font-bold uppercase tracking-widest text-slate-500 italic';
        if (dom.statusDot) dom.statusDot.className = 'status-dot';
    }
    lucide.createIcons();
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
    dom.connectScreen.classList.remove('hidden');
    if (window.gsap) {
        gsap.fromTo(dom.connectScreen, 
            { opacity: 0, y: 50 },
            { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' }
        );
    }
}

function hideScannerOverlay() {
    if (window.gsap) {
        gsap.to(dom.connectScreen, {
            opacity: 0,
            y: 50,
            duration: 0.3,
            ease: 'power3.in',
            onComplete: () => {
                dom.connectScreen.classList.add('hidden');
                stopScanner();
            }
        });
    } else {
        dom.connectScreen.classList.add('hidden');
        stopScanner();
    }
}

/* ── QR Scanner ───────────────────────────────────────────── */
async function startScan() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });

        dom.scannerVideo.srcObject = stream;
        await dom.scannerVideo.play();

        dom.btnScanStart.textContent = 'SYSTEM LISTENING…';
        dom.btnScanStart.disabled = true;

        clearInterval(state.scanTimer);
        state.scanTimer = setInterval(readQrFrame, 200);
    } catch (err) {
        alert(`Camera error: ${err.message}`);
        dom.btnScanStart.disabled = false;
    }
}

function readQrFrame() {
    if (dom.scannerVideo.readyState !== dom.scannerVideo.HAVE_ENOUGH_DATA) return;

    dom.scannerCanvas.width  = dom.scannerVideo.videoWidth;
    dom.scannerCanvas.height = dom.scannerVideo.videoHeight;
    const ctx = dom.scannerCanvas.getContext('2d');
    ctx.drawImage(dom.scannerVideo, 0, 0);
    const img  = ctx.getImageData(0, 0, dom.scannerCanvas.width, dom.scannerCanvas.height);
    const code = jsQR(img.data, img.width, img.height);

    if (code) {
        clearInterval(state.scanTimer);
        if (navigator.vibrate) navigator.vibrate([60, 30, 60]);
        try {
            handleHandshake(JSON.parse(code.data));
        } catch (e) {
            alert('Invalid QR code');
            startScan(); // Resume scanning
        }
    }
}

function stopScanner() {
    clearInterval(state.scanTimer);
    if (dom.scannerVideo.srcObject) {
        dom.scannerVideo.srcObject.getTracks().forEach((t) => t.stop());
        dom.scannerVideo.srcObject = null;
    }
    dom.btnScanStart.textContent = 'Initialize Scanner';
    dom.btnScanStart.disabled = false;
}

/* ── Handshake ────────────────────────────────────────────── */
async function handleHandshake(payload) {
    state.laptopIp = payload.ip;
    state.token = payload.token;
    
    localStorage.setItem('laptopIp', state.laptopIp);
    localStorage.setItem('connectionToken', state.token);

    updateConnectionUI(true);
    hideScannerOverlay();
    setPane('browse');
    await loadRemoteFiles('/');
}

/* ── File loading ─────────────────────────────────────────── */
async function loadRemoteFiles(path) {
    state.currentPath = path;
    localStorage.setItem('lastPath', path);

    if (dom.currentPathMobile) dom.currentPathMobile.textContent = shorten(path);
    if (dom.currentDirLabel) dom.currentDirLabel.textContent   = basename(path) || 'Workstation';
    if (dom.settingsFolder) dom.settingsFolder.textContent    = path;
    if (dom.btnBackDir) dom.btnBackDir.disabled           = isRootPath(path);

    if (dom.fileList) {
        dom.fileList.innerHTML = [1,2,3,4].map(() =>
            `<div class="glass-card p-5 rounded-[32px] animate-pulse h-40"></div>`
        ).join('');
    }
    if (dom.browserEmpty) dom.browserEmpty.classList.add('hidden');

    try {
        const res = await fetch(`http://${state.laptopIp}:3000/api/files?path=${encodeURIComponent(path)}&token=${state.token}`);
        if (!res.ok) throw new Error('Unauthorized');
        
        const files = await res.json();
        state.currentItems = sortFiles(files);
        renderFiles(filterCurrentItems());
    } catch (err) {
        console.error(err);
        updateConnectionUI(false);
        if (dom.fileList) dom.fileList.innerHTML = '';
        if (dom.browserEmpty) dom.browserEmpty.classList.remove('hidden');
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
    lucide.createIcons();
}

function getIconColor(kind) {
    switch (kind) {
        case 'folder': return 'blue';
        case 'image': return 'indigo';
        case 'video': return 'rose';
        case 'audio': return 'emerald';
        case 'archive': return 'orange';
        case 'document': return 'blue';
        default: return 'slate';
    }
}

async function hydrateThumbnail(file, card, renderId) {
    try {
        const res = await fetch(`http://${state.laptopIp}:3000/api/thumbnail?path=${encodeURIComponent(file.path)}&token=${state.token}`);
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
        recordTransfer({
            id: `download-${Date.now()}`,
            name: file.name,
            status: 'done',
            transferred: file.size,
            total: file.size,
        });
        window.open(`http://${state.laptopIp}:3000/api/file?path=${encodeURIComponent(file.path)}&token=${state.token}`, '_blank');
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
            dom.mobileTransferList.innerHTML = `<div class="py-20 flex flex-col items-center justify-center text-center opacity-20"><i data-lucide="satellite" class="w-12 h-12 text-slate-400 mb-6"></i><p class="text-xs font-bold uppercase tracking-widest">No Active Handshakes</p></div>`;
            lucide.createIcons();
        }
        return;
    }

    if (dom.mobileTransferList) {
        dom.mobileTransferList.innerHTML = items.map((item) => {
            const pct = item.total ? Math.round((item.transferred / item.total) * 100) : 0;
            const isDone = item.status === 'done';
            return `
                <article class="glass-card p-5 rounded-[32px] flex items-center gap-5">
                    <div class="w-12 h-12 rounded-[20px] ${isDone ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-blue-600/10 text-blue-500'} flex items-center justify-center">
                        <i data-lucide="${isDone ? 'check' : 'arrow-up-circle'}" class="w-6 h-6"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-center mb-2">
                            <div class="text-[11px] font-extrabold text-white truncate mr-4 uppercase tracking-wider italic">${escapeHtml(item.name)}</div>
                            <span class="text-[9px] font-extrabold uppercase tracking-widest ${isDone ? 'text-blue-500' : 'text-blue-400'}">${item.status}</span>
                        </div>
                        <div class="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                            <div class="h-full ${isDone ? 'bg-blue-600' : 'bg-blue-500 animate-pulse'} transition-all duration-300" style="width:${pct}%"></div>
                        </div>
                    </div>
                </article>`;
        }).join('');
        lucide.createIcons();
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
        xhr.open('POST', `http://${state.laptopIp}:3000/api/upload?path=${encodeURIComponent(state.currentPath)}&token=${state.token}`);

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
    dom.uploadToastLabel.textContent = pct === 100 ? `SYNC COMPLETE: ${name}` : `SYNCING PAYLOAD: ${pct}%`;
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
function basename(path) { return path.split(/[\\/]/).filter(Boolean).pop() || ''; }
function shorten(path) { return path.length > 20 ? '...' + path.slice(-17) : path; }
function parentPath(path) { 
    const p = path.split(/[\\/]/).filter(Boolean);
    p.pop();
    return p.length === 0 ? '/' : '/' + p.join('/');
}
function isRootPath(path) { return path === '/' || !path || path.endsWith(':'); }

init();