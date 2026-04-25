/* ── State ────────────────────────────────────────────────── */
let currentPath    = '/';
let token          = '';
let laptopIp       = '';
let currentItems   = [];
let currentPane    = 'browse';
let searchTimer    = null;
let thumbVersion   = 0;
let scanTimer      = null;
const uploads      = new Map();

/* ── DOM refs ─────────────────────────────────────────────── */
const connectScreen        = document.getElementById('connect-screen');
const browserScreen        = document.getElementById('browser-screen');
const fileList             = document.getElementById('file-list');
const browseCount          = document.getElementById('browse-count');
const currentDirLabel      = document.getElementById('current-dir-label');
const sessionLabel         = document.getElementById('session-label');
const currentPathMobile    = document.getElementById('current-path-mobile');
const browserEmpty         = document.getElementById('browser-empty');
const mobileSearch         = document.getElementById('mobile-search');
const clearMobileSearchBtn = document.getElementById('btn-clear-mobile-search');
const transferCountMobile  = document.getElementById('transfer-count-mobile');
const mobileTransferList   = document.getElementById('mobile-transfer-list');
const settingsHost         = document.getElementById('settings-host');
const settingsFolder       = document.getElementById('settings-folder');
const btnBackDir           = document.getElementById('btn-back-dir');
const btnUpload            = document.getElementById('btn-upload-pro');
const btnScanStart         = document.getElementById('btn-scan-start');
const btnRescan            = document.getElementById('btn-rescan');
const pillNetwork          = document.getElementById('pill-network');
const pillCamera           = document.getElementById('pill-camera');
const fileInput            = document.getElementById('file-input');
const scannerVideo         = document.getElementById('scanner-video');
const scannerCanvas        = document.getElementById('scanner-canvas');
const uploadToast          = document.getElementById('upload-toast');
const uploadToastLabel     = document.getElementById('upload-toast-label');
const uploadToastFill      = document.getElementById('upload-toast-fill');
const dockItems            = document.querySelectorAll('.dock-item');
const panes = {
    home:      document.getElementById('home-pane'),
    browse:    document.getElementById('browse-pane'),
    transfers: document.getElementById('transfers-pane'),
    settings:  document.getElementById('settings-pane'),
};

/* ── Init ─────────────────────────────────────────────────── */
function init() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js');
    }

    checkSetup();
    setPane('home');

    // UI Bindings for the Dashboard
    const btnOpenScanner = document.getElementById('btn-open-scanner');
    btnOpenScanner.addEventListener('click', showScannerOverlay);

    const btnCloseScanner = document.querySelector('.light.close');
    btnCloseScanner.addEventListener('click', hideScannerOverlay);

    const categoryCards = document.querySelectorAll('.category-card');
    categoryCards.forEach(card => {
        card.addEventListener('click', () => {
            if (!token || !laptopIp) {
                showScannerOverlay();
                alert('Please connect to the Desktop app first before sending files.');
                return;
            }
            const type = card.getAttribute('data-pick');
            if (type === '*') {
                fileInput.removeAttribute('accept');
            } else {
                fileInput.setAttribute('accept', type);
            }
            // Temporarily intercept the standard flow to ensure it uploads to the correct folder
            document.getElementById('file-input').click();
        });
    });
}

function showScannerOverlay() {
    connectScreen.classList.remove('hidden');
    gsap.fromTo('#connect-window', 
        { y: '100%' },
        { y: 0, duration: 0.4, ease: 'power3.out' }
    );
}

function hideScannerOverlay() {
    gsap.to('#connect-window', {
        y: '100%',
        duration: 0.3,
        ease: 'power3.in',
        onComplete: () => {
             connectScreen.classList.add('hidden');
        }
    });
}

/* ── Setup checks ─────────────────────────────────────────── */
function checkSetup() {
    const online = navigator.onLine;
    pillNetwork.textContent = online ? '✓ Network ready' : '⚡ Offline ready';
    pillNetwork.classList.toggle('ok', online);

    // If device doesn't even have mediaDevices (usually because of HTTP instead of HTTPS on mobile)
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        pillCamera.textContent = '✗ Require HTTPS for Camera';
        pillCamera.classList.add('fail');
        return;
    }

    navigator.mediaDevices.enumerateDevices()
        .then((devices) => {
            const hasCamera = devices.some((d) => d.kind === 'videoinput');
            pillCamera.textContent = hasCamera ? '✓ Camera ready' : '✗ No camera';
            pillCamera.classList.toggle('ok', hasCamera);
            pillCamera.classList.toggle('fail', !hasCamera);
        })
        .catch((err) => {
            console.warn('Enum err:', err);
            pillCamera.textContent = '· Camera pending';
        });
}

/* ── QR Scanner ───────────────────────────────────────────── */
async function startScan() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Camera access is blocked because you are not using HTTPS. Please access LocalBridge via HTTPS (like your Vercel URL) on your phone.');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });

        scannerVideo.srcObject = stream;
        await scannerVideo.play();

        btnScanStart.textContent = 'Scanning…';
        btnScanStart.disabled = true;
        pillCamera.textContent = '● Scanning QR';
        pillCamera.classList.add('ok');
        pillCamera.classList.remove('fail');

        clearInterval(scanTimer);
        scanTimer = setInterval(readQrFrame, 200);
    } catch (err) {
        console.error('Scan err:', err);
        alert(`Camera error: ${err.name} - ${err.message}. Please allow camera permissions.`);
        pillCamera.textContent = '✗ Permission denied';
        pillCamera.classList.add('fail');
        btnScanStart.textContent = 'Start Camera Scan';
        btnScanStart.disabled = false;
    }
}

function readQrFrame() {
    if (scannerVideo.readyState !== scannerVideo.HAVE_ENOUGH_DATA) return;

    scannerCanvas.width  = scannerVideo.videoWidth;
    scannerCanvas.height = scannerVideo.videoHeight;
    const ctx = scannerCanvas.getContext('2d');
    ctx.drawImage(scannerVideo, 0, 0);
    const img  = ctx.getImageData(0, 0, scannerCanvas.width, scannerCanvas.height);
    const code = jsQR(img.data, img.width, img.height);

    if (!code) return;

    clearInterval(scanTimer);
    if (navigator.vibrate) navigator.vibrate([60, 30, 60]);

    try {
        handleHandshake(JSON.parse(code.data));
    } catch (e) {
        console.error(e);
        alert('Invalid QR code. Please scan the LocalBridge desktop QR.');
    }
}

/* ── Handshake / session transition ─────────────────────── */
async function handleHandshake(payload) {
    laptopIp = payload.ip;
    token    = payload.token;

    document.getElementById('dashboard-connect').innerHTML = `
        <div>
            <h4 style="font-size:1.0rem; font-weight:800; margin-bottom:4px; color:var(--green-text);">Connected to ${laptopIp}</h4>
            <p style="font-size:0.8rem; color:var(--text-sec); line-height:1.4;">Ready to send files instantly.</p>
        </div>
        <div style="width:48px; height:48px; border-radius:50%; background:var(--green-soft); color:var(--green-text); display:grid; place-items:center;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><path d="M20 6L9 17l-5-5"/></svg>
        </div>
    `;

    stopScanner();

    // Animate out connect screen overlay
    hideScannerOverlay();

    setPane('browse');
    await loadRemoteFiles('/');
}

function stopScanner() {
    clearInterval(scanTimer);
    if (scannerVideo.srcObject) {
        scannerVideo.srcObject.getTracks().forEach((t) => t.stop());
        scannerVideo.srcObject = null;
    }
}

/* ── File loading ─────────────────────────────────────────── */
async function loadRemoteFiles(path) {
    currentPath = path;
    currentPathMobile.textContent = shorten(currentPath);
    currentDirLabel.textContent   = basename(currentPath) || 'Workstation';
    settingsFolder.textContent    = currentPath;
    btnBackDir.disabled           = isRootPath(currentPath);

    // Show skeleton while loading
    fileList.innerHTML = [1,2,3,4].map(() =>
        `<div class="file-cell"><div class="file-cell-icon kind-file skeleton" style="width:42px;height:42px;border-radius:13px;"></div><div class="file-cell-body"><div class="skeleton" style="height:12px;width:80%;border-radius:6px;margin-bottom:6px;"></div><div class="skeleton" style="height:10px;width:50%;border-radius:6px;"></div></div></div>`
    ).join('');
    browserEmpty.classList.add('hidden');

    try {
        const res   = await fetch(`http://${laptopIp}:3000/api/files?path=${encodeURIComponent(path)}&token=${token}`);
        const files = await res.json();
        currentItems = sortFiles(files);
        renderFiles(filterCurrentItems());
    } catch (err) {
        console.error(err);
        sessionLabel.textContent = '⚠ Connection interrupted';
        fileList.innerHTML = '';
        browserEmpty.classList.remove('hidden');
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
    const q = mobileSearch.value.trim().toLowerCase();
    return q ? currentItems.filter((f) => f.name.toLowerCase().includes(q)) : currentItems;
}

/* ── File rendering ───────────────────────────────────────── */
function renderFiles(files) {
    fileList.innerHTML = '';
    const showEmpty = files.length === 0;
    browserEmpty.classList.toggle('hidden', !showEmpty);
    browseCount.textContent = `${files.length} item${files.length === 1 ? '' : 's'}`;
    clearMobileSearchBtn.classList.toggle('hidden', !mobileSearch.value.trim());

    if (showEmpty) return;

    const renderId = ++thumbVersion;

    files.forEach((file, i) => {
        const card = document.createElement('button');
        card.type      = 'button';
        card.className = 'file-cell';
        card.style.animationDelay = `${i * 25}ms`;

        card.innerHTML = `
            <div class="file-cell-icon kind-${file.kind}">${getFileIcon(file.kind)}</div>
            <div class="file-cell-body">
                <div class="file-cell-name">${escapeHtml(file.name)}</div>
                <div class="file-cell-size">${file.kind === 'folder' ? 'Folder' : formatSize(file.size)}</div>
            </div>
        `;

        card.addEventListener('click', () => handleFileTap(file));
        fileList.appendChild(card);

        // Lazy-load thumbnail for images
        if (file.kind === 'image') {
            hydrateThumbnail(file, card, renderId);
        }
    });
}

async function hydrateThumbnail(file, card, renderId) {
    try {
        const res = await fetch(`http://${laptopIp}:3000/api/thumbnail?path=${encodeURIComponent(file.path)}&token=${token}`);
        if (!res.ok || renderId !== thumbVersion) return;
        const payload = await res.json();
        if (payload.thumbnail) {
            const icon = card.querySelector('.file-cell-icon');
            if (icon) {
                icon.style.width  = '100%';
                icon.style.height = 'auto';
                icon.style.aspectRatio = '4/3';
                icon.style.borderRadius = '10px';
                icon.innerHTML = `<img src="data:image/jpeg;base64,${payload.thumbnail}" alt="${escapeHtml(file.name)}" class="file-cell-thumb">`;
            }
        }
    } catch (e) { /* silent */ }
}

function handleFileTap(file) {
    if (file.kind === 'folder') {
        loadRemoteFiles(file.path);
        return;
    }

    recordTransfer({
        id:          `download-${Date.now()}`,
        name:        file.name,
        status:      'ready',
        transferred: file.size,
        total:       file.size,
    });

    window.open(
        `http://${laptopIp}:3000/api/file?path=${encodeURIComponent(file.path)}&token=${token}`,
        '_blank'
    );
}

/* ── Pane switching ───────────────────────────────────────── */
function setPane(paneName) {
    currentPane = paneName;
    Object.entries(panes).forEach(([name, pane]) => {
        pane.classList.toggle('hidden', name !== paneName);
    });
    dockItems.forEach((item) => {
        item.classList.toggle('is-active', item.dataset.pane === paneName);
    });
}

/* ── Transfers ────────────────────────────────────────────── */
function recordTransfer(entry) {
    const existing = uploads.get(entry.id) || {};
    uploads.set(entry.id, { ...existing, ...entry, updatedAt: Date.now() });
    renderTransfers();
}

function renderTransfers() {
    const items = [...uploads.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    transferCountMobile.textContent = `${items.length} upload${items.length === 1 ? '' : 's'}`;

    if (items.length === 0) {
        mobileTransferList.innerHTML = `
            <div class="transfer-empty">
                <strong>No uploads yet</strong>
                <p>Tap the upload button to send files to the desktop.</p>
            </div>`;
        return;
    }

    mobileTransferList.innerHTML = items.map((item) => {
        const total    = item.total || 0;
        const progress = total > 0
            ? Math.min(100, Math.round((item.transferred / total) * 100))
            : item.status === 'done' ? 100 : 12;
        const isDone    = item.status === 'done';
        const isFailed  = item.status === 'failed';
        const barClass  = isDone || isFailed ? '' : 'is-indeterminate';
        const barWidth  = isDone ? '100%' : isFailed ? '0%' : `${progress}%`;

        return `
            <article class="transfer-item">
                <div class="transfer-row">
                    <div class="transfer-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/>
                            <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/>
                        </svg>
                    </div>
                    <div class="transfer-info">
                        <div class="transfer-name">${escapeHtml(item.name)}</div>
                        <div class="transfer-sub">${formatSize(item.transferred)}${total ? ` / ${formatSize(total)}` : ''} · ${progress}%</div>
                    </div>
                    <span class="transfer-status ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill ${barClass}" style="width:${barWidth}"></div>
                </div>
            </article>`;
    }).join('');
}

/* ── Upload ───────────────────────────────────────────────── */
async function uploadFiles(files) {
    if (!files.length || !laptopIp || !token) return;

    setPane('transfers');

    for (const file of files) {
        await uploadSingleFile(file);
    }

    fileInput.value = '';
    hideToast();
    loadRemoteFiles(currentPath);
}

function uploadSingleFile(file) {
    return new Promise((resolve) => {
        const id       = `upload-${file.name}-${Date.now()}`;
        const formData = new FormData();
        formData.append('file', file, file.name);

        recordTransfer({ id, name: file.name, status: 'queued', transferred: 0, total: file.size });
        showToast(file.name, 0);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', `http://${laptopIp}:3000/api/upload?path=${encodeURIComponent(currentPath)}&token=${token}`);

        xhr.upload.onprogress = (e) => {
            const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
            recordTransfer({ id, name: file.name, status: 'uploading', transferred: e.loaded, total: e.total || file.size });
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
    uploadToastLabel.textContent = pct === 100
        ? `✓ ${name} done`
        : `Uploading ${name}… ${pct}%`;
    uploadToastFill.style.width = `${pct}%`;
    uploadToast.classList.add('visible');
}

function hideToast() {
    uploadToast.classList.remove('visible');
}

/* ── Session reset ────────────────────────────────────────── */
function resetSession() {
    stopScanner();
    currentPath = '/';
    token = '';
    laptopIp = '';
    currentItems = [];
    uploads.clear();
    mobileSearch.value = '';
    currentPathMobile.textContent = '/';
    currentDirLabel.textContent   = 'Workstation';
    sessionLabel.textContent      = '● Connected locally';
    settingsHost.textContent      = 'Not connected';
    settingsFolder.textContent    = '/';
    btnBackDir.disabled           = true;
    browseCount.textContent       = '0 items';
    fileList.innerHTML            = '';
    renderTransfers();
    hideToast();

    browserScreen.classList.add('hidden');
    connectScreen.classList.remove('hidden');
    btnScanStart.textContent = 'Start Camera Scan';
    btnScanStart.disabled    = false;

    gsap.fromTo('#connect-window',
        { opacity: 0, y: 32, scale: 0.96 },
        { duration: 0.6, opacity: 1, y: 0, scale: 1, ease: 'expo.out' }
    );
}

/* ── Helpers ──────────────────────────────────────────────── */
function getFileIcon(kind) {
    const icons = {
        folder:   `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#ffb830" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
        image:    `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
        video:    `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#c084fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`,
        audio:    `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fb7185" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
        archive:  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fb923c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`,
        document: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>`,
        file:     `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`,
    };
    return icons[kind] || icons.file;
}

function formatSize(bytes) {
    if (!bytes) return '--';
    const units = ['B','KB','MB','GB','TB'];
    let v = bytes, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function escapeHtml(v) {
    return String(v)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function basename(path) {
    const n = String(path).replace(/\\/g, '/').replace(/\/$/, '');
    if (/^[A-Za-z]:$/.test(n)) return n;
    return n.split('/').filter(Boolean).at(-1) || path;
}

function shorten(path) {
    if (!path || path === '/') return '/';
    const parts = String(path).replace(/\\/g, '/').replace(/\/$/, '').split('/').filter(Boolean);
    return parts.length <= 2 ? path : `…/${parts.slice(-2).join('/')}`;
}

function parentPath(path) {
    const n = String(path).replace(/\\/g, '/').replace(/\/$/, '');
    if (n === '/' || /^[A-Za-z]:$/.test(n)) return path;
    const parts = n.split('/').filter(Boolean);
    if (!parts.length) return '/';
    if (/^[A-Za-z]:$/.test(parts[0])) {
        parts.pop();
        return parts.length === 1 ? `${parts[0]}/` : parts.join('/');
    }
    parts.pop();
    return `/${parts.join('/')}` || '/';
}

function isRootPath(path) {
    const n = String(path).replace(/\\/g, '/').replace(/\/$/, '');
    return n === '' || n === '/' || /^[A-Za-z]:$/.test(n);
}

/* ── Event wiring ─────────────────────────────────────────── */
btnScanStart.addEventListener('click', startScan);
btnBackDir.addEventListener('click', () => {
    if (!isRootPath(currentPath)) {
        mobileSearch.value = '';
        clearMobileSearchBtn.classList.add('hidden');
        loadRemoteFiles(parentPath(currentPath));
    }
});
btnUpload.addEventListener('click', () => fileInput.click());
btnRescan.addEventListener('click', resetSession);
fileInput.addEventListener('change', () => uploadFiles([...fileInput.files]));
mobileSearch.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderFiles(filterCurrentItems()), 100);
});
clearMobileSearchBtn.addEventListener('click', () => {
    mobileSearch.value = '';
    renderFiles(filterCurrentItems());
});
dockItems.forEach((item) => item.addEventListener('click', () => setPane(item.dataset.pane)));

init();
