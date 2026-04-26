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
    browserScreen:        document.getElementById('browser-screen'),
    fileList:             document.getElementById('file-list'),
    browseCount:          document.getElementById('browse-count'),
    currentDirLabel:      document.getElementById('current-dir-label'),
    sessionLabel:         document.getElementById('session-label'),
    currentPathMobile:    document.getElementById('current-path-mobile'),
    browserEmpty:         document.getElementById('browser-empty'),
    mobileSearch:         document.getElementById('mobile-search'),
    clearMobileSearchBtn: document.getElementById('btn-clear-mobile-search'),
    transferCountMobile:  document.getElementById('transfer-count-mobile'),
    mobileTransferList:   document.getElementById('mobile-transfer-list'),
    settingsHost:         document.getElementById('settings-host'),
    settingsFolder:       document.getElementById('settings-folder'),
    btnBackDir:           document.getElementById('btn-back-dir'),
    btnUpload:            document.getElementById('btn-upload-pro'),
    btnScanStart:         document.getElementById('btn-scan-start'),
    btnRescan:            document.getElementById('btn-rescan'),
    pillNetwork:          document.getElementById('pill-network'),
    pillCamera:           document.getElementById('pill-camera'),
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
    checkSetup();
    
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
    dom.btnOpenScanner.addEventListener('click', showScannerOverlay);
    dom.btnScanStart.addEventListener('click', startScan);
    
    const btnCloseScanner = dom.connectScreen.querySelector('.light.close');
    if (btnCloseScanner) btnCloseScanner.addEventListener('click', hideScannerOverlay);

    // Browsing
    dom.btnBackDir.addEventListener('click', () => {
        if (!isRootPath(state.currentPath)) {
            loadRemoteFiles(parentPath(state.currentPath));
        }
    });

    dom.mobileSearch.addEventListener('input', () => {
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(() => renderFiles(filterCurrentItems()), 100);
    });

    dom.clearMobileSearchBtn.addEventListener('click', () => {
        dom.mobileSearch.value = '';
        renderFiles(filterCurrentItems());
    });

    // Uploads
    dom.btnUpload.addEventListener('click', () => dom.fileInput.click());
    dom.fileInput.addEventListener('change', () => uploadFiles([...dom.fileInput.files]));

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
    dom.btnRescan.addEventListener('click', resetSession);
}

function updateConnectionUI(connected) {
    state.isConnected = connected;
    if (connected) {
        dom.dashboardConnect.innerHTML = `
            <div>
                <h4 class="font-black text-white text-sm uppercase tracking-wider mb-1">Station Linked</h4>
                <p class="text-[11px] text-blue-400 font-bold tracking-tight">${state.laptopIp}</p>
            </div>
            <div class="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center">
                <i data-lucide="check" class="w-6 h-6"></i>
            </div>
        `;
        dom.settingsHost.textContent = state.laptopIp;
        dom.sessionLabel.textContent = '● Connected';
        dom.sessionLabel.className = 'text-[9px] font-black uppercase tracking-[0.1em] text-blue-500';
    } else {
        dom.dashboardConnect.innerHTML = `
            <div>
                <h4 class="font-black text-white text-sm uppercase tracking-wider mb-1">Not Connected</h4>
                <p class="text-[11px] text-slate-400 leading-relaxed font-medium">Link with your workstation to start moving data.</p>
            </div>
            <button id="btn-open-scanner-new" class="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/20 active:scale-90 transition-transform">
                <i data-lucide="maximize" class="w-6 h-6"></i>
            </button>
        `;
        document.getElementById('btn-open-scanner-new').addEventListener('click', showScannerOverlay);
        dom.settingsHost.textContent = '--';
        dom.sessionLabel.textContent = '○ Off-Air';
        dom.sessionLabel.className = 'text-[9px] font-black uppercase tracking-[0.1em] text-slate-500';
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
    
    if (paneName === 'browse') {
        dom.currentDirLabel.className = 'text-lg font-black tracking-tight leading-tight text-white uppercase italic';
    }
}

function showScannerOverlay() {
    dom.connectScreen.classList.remove('hidden');
    if (window.gsap) {
        gsap.fromTo('#connect-window', 
            { y: '100%' },
            { y: 0, duration: 0.4, ease: 'power3.out' }
        );
    }
}

function hideScannerOverlay() {
    if (window.gsap) {
        gsap.to('#connect-window', {
            y: '100%',
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

/* ── Setup checks ─────────────────────────────────────────── */
function checkSetup() {
    const online = navigator.onLine;
    dom.pillNetwork.textContent = online ? '✓ Network ready' : '⚡ Offline ready';
    dom.pillNetwork.classList.toggle('ok', online);

    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        dom.pillCamera.textContent = '✗ Require HTTPS';
        dom.pillCamera.classList.add('fail');
        return;
    }

    navigator.mediaDevices.enumerateDevices()
        .then((devices) => {
            const hasCamera = devices.some((d) => d.kind === 'videoinput');
            dom.pillCamera.textContent = hasCamera ? '✓ Camera ready' : '✗ No camera';
            dom.pillCamera.classList.toggle('ok', hasCamera);
            dom.pillCamera.classList.toggle('fail', !hasCamera);
        })
        .catch(() => {
            dom.pillCamera.textContent = '· Camera pending';
        });
}

/* ── QR Scanner ───────────────────────────────────────────── */
async function startScan() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });

        dom.scannerVideo.srcObject = stream;
        await dom.scannerVideo.play();

        dom.btnScanStart.textContent = 'Scanning…';
        dom.btnScanStart.disabled = true;
        dom.pillCamera.textContent = '● Scanning QR';
        dom.pillCamera.classList.add('ok');

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
    dom.btnScanStart.textContent = 'Start Camera Scan';
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

    dom.currentPathMobile.textContent = shorten(path);
    dom.currentDirLabel.textContent   = basename(path) || 'Workstation';
    dom.settingsFolder.textContent    = path;
    dom.btnBackDir.disabled           = isRootPath(path);

    dom.fileList.innerHTML = [1,2,3,4].map(() =>
        `<div class="file-cell"><div class="file-cell-icon skeleton" style="width:42px;height:42px;"></div><div class="file-cell-body"><div class="skeleton" style="height:12px;width:80%;margin-bottom:6px;"></div><div class="skeleton" style="height:10px;width:50%;"></div></div></div>`
    ).join('');
    dom.browserEmpty.classList.add('hidden');

    try {
        const res = await fetch(`http://${state.laptopIp}:3000/api/files?path=${encodeURIComponent(path)}&token=${state.token}`);
        if (!res.ok) throw new Error('Unauthorized');
        
        const files = await res.json();
        state.currentItems = sortFiles(files);
        renderFiles(filterCurrentItems());
    } catch (err) {
        console.error(err);
        updateConnectionUI(false);
        dom.fileList.innerHTML = '';
        dom.browserEmpty.classList.remove('hidden');
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
    const q = dom.mobileSearch.value.trim().toLowerCase();
    return q ? state.currentItems.filter((f) => f.name.toLowerCase().includes(q)) : state.currentItems;
}

function renderFiles(files) {
    dom.fileList.innerHTML = '';
    const showEmpty = files.length === 0;
    dom.browserEmpty.classList.toggle('hidden', !showEmpty);
    dom.browseCount.textContent = `${files.length} ITEMS`;
    dom.clearMobileSearchBtn.classList.toggle('hidden', !dom.mobileSearch.value.trim());

    if (showEmpty) return;

    const renderId = ++state.thumbVersion;

    files.forEach((file, i) => {
        const card = document.createElement('button');
        card.className = 'file-cell glass p-5 rounded-[32px] text-left active:scale-95 transition-transform flex flex-col gap-4 group border border-white/5 shadow-inner';
        card.style.animation = `cellIn 0.3s ease-out both ${i * 20}ms`;
        
        const iconColor = getIconColor(file.kind);

        card.innerHTML = `
            <div class="file-cell-icon w-11 h-11 rounded-2xl flex items-center justify-center bg-${iconColor}-500/10 text-${iconColor}-400 group-hover:bg-${iconColor}-600 group-hover:text-white transition-all">
                ${getFileIcon(file.kind)}
            </div>
            <div class="file-cell-body min-w-0">
                <div class="file-cell-name text-[11px] font-black text-white truncate mb-0.5 uppercase tracking-wide">${escapeHtml(file.name)}</div>
                <div class="file-cell-size text-[9px] font-bold text-slate-500 uppercase tracking-widest">${file.kind === 'folder' ? 'Folder' : formatSize(file.size)}</div>
            </div>
        `;
        card.addEventListener('click', () => handleFileTap(file));
        dom.fileList.appendChild(card);

        if (file.kind === 'image') hydrateThumbnail(file, card, renderId);
    });
}

function getIconColor(kind) {
    switch (kind) {
        case 'folder': return 'blue';
        case 'image': return 'indigo';
        case 'video': return 'purple';
        case 'audio': return 'rose';
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
                icon.innerHTML = `<img src="data:image/jpeg;base64,${payload.thumbnail}" class="file-cell-thumb" style="width:100%;height:100%;object-fit:cover;border-radius:14px;">`;
                icon.className = "file-cell-icon w-full aspect-square rounded-[22px] flex items-center justify-center bg-black/20 overflow-hidden";
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
    dom.transferCountMobile.textContent = `${items.length} ACTIVE`;

    if (items.length === 0) {
        dom.mobileTransferList.innerHTML = `<div class="transfer-empty glass p-10 rounded-[40px] border border-dashed border-white/5 text-center shadow-inner opacity-40"><strong class="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Silent Airwaves</strong><p class="text-[9px] text-slate-600 mt-2 font-bold uppercase tracking-widest">No active traffic detected.</p></div>`;
        return;
    }

    dom.mobileTransferList.innerHTML = items.map((item) => {
        const pct = item.total ? Math.round((item.transferred / item.total) * 100) : 0;
        const isDone = item.status === 'done';
        return `
            <article class="glass p-5 rounded-[32px] border border-white/5 flex items-center gap-5 shadow-inner">
                <div class="w-12 h-12 rounded-[20px] ${isDone ? 'bg-blue-600 text-white' : 'bg-indigo-500/10 text-indigo-400'} flex items-center justify-center shadow-lg">
                    <i data-lucide="${isDone ? 'check' : 'upload-cloud'}" class="w-6 h-6"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-center mb-2">
                        <div class="text-[11px] font-black text-white truncate mr-4 uppercase tracking-wider">${escapeHtml(item.name)}</div>
                        <span class="text-[9px] font-black uppercase tracking-widest ${isDone ? 'text-blue-500' : 'text-indigo-400'}">${item.status}</span>
                    </div>
                    <div class="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div class="h-full ${isDone ? 'bg-blue-600' : 'bg-blue-500 animate-pulse'} transition-all duration-500" style="width:${pct}%"></div>
                    </div>
                </div>
            </article>`;
    }).join('');
    lucide.createIcons();
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
    dom.uploadToastLabel.textContent = pct === 100 ? `SYNC COMPLETE: ${name}` : `SYNCING: ${name} ${pct}%`;
    dom.uploadToastFill.style.width = `${pct}%`;
    dom.uploadToast.classList.add('visible');
    dom.uploadToast.classList.remove('opacity-0', 'translate-y-20');
    if (pct === 100) setTimeout(hideToast, 3000);
}

function hideToast() { 
    dom.uploadToast.classList.add('opacity-0', 'translate-y-20');
    setTimeout(() => dom.uploadToast.classList.remove('visible'), 300);
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
        video:    'video',
        audio:    'music',
        archive:  'archive',
        document: 'file-text',
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