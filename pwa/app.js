let currentPath = '/';
let token = '';
let laptopIp = '';
let currentItems = [];
let currentPane = 'browse';
let searchTimer = null;
let thumbnailVersion = 0;
let scanTimer = null;
const uploads = new Map();

const connectScreen = document.getElementById('connect-screen');
const browserScreen = document.getElementById('browser-screen');
const fileList = document.getElementById('file-list');
const browseCount = document.getElementById('browse-count');
const currentDirLabel = document.getElementById('current-dir-label');
const sessionLabel = document.getElementById('session-label');
const currentPathMobile = document.getElementById('current-path-mobile');
const browserEmpty = document.getElementById('browser-empty');
const mobileSearch = document.getElementById('mobile-search');
const clearMobileSearchBtn = document.getElementById('btn-clear-mobile-search');
const transferCountMobile = document.getElementById('transfer-count-mobile');
const mobileTransferList = document.getElementById('mobile-transfer-list');
const settingsHost = document.getElementById('settings-host');
const settingsFolder = document.getElementById('settings-folder');
const btnBackDir = document.getElementById('btn-back-dir');
const btnUpload = document.getElementById('btn-upload-pro');
const btnScanStart = document.getElementById('btn-scan-start');
const btnRescan = document.getElementById('btn-rescan');
const pillNetwork = document.getElementById('pill-network');
const pillCamera = document.getElementById('pill-camera');
const fileInput = document.getElementById('file-input');
const scannerVideo = document.getElementById('scanner-video');
const scannerCanvas = document.getElementById('scanner-canvas');
const dockItems = document.querySelectorAll('.dock-item');
const panes = {
    browse: document.getElementById('browse-pane'),
    transfers: document.getElementById('transfers-pane'),
    settings: document.getElementById('settings-pane')
};

function init() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js');
    }

    checkSetup();

    gsap.from('#connect-window', {
        duration: 1,
        y: 50,
        opacity: 0,
        scale: 0.96,
        ease: 'expo.out'
    });
}

function checkSetup() {
    pillNetwork.textContent = navigator.onLine ? 'Phone is online' : 'Offline mode is fine';
    pillNetwork.classList.add('is-ready');

    navigator.mediaDevices.enumerateDevices()
        .then((devices) => {
            if (devices.some((device) => device.kind === 'videoinput')) {
                pillCamera.textContent = 'Camera available';
                pillCamera.classList.add('is-ready');
            } else {
                pillCamera.textContent = 'Camera not detected';
            }
        })
        .catch(() => {
            pillCamera.textContent = 'Camera access pending';
        });
}

async function startScan() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });

        scannerVideo.srcObject = stream;
        await scannerVideo.play();

        btnScanStart.textContent = 'Scanning...';
        btnScanStart.disabled = true;
        pillCamera.textContent = 'Scanning for QR';
        pillCamera.classList.add('is-ready');

        clearInterval(scanTimer);
        scanTimer = setInterval(readQrFrame, 220);
    } catch (error) {
        console.error(error);
        alert('Camera permission is required to pair with the desktop app.');
        btnScanStart.textContent = 'Start Camera Scan';
        btnScanStart.disabled = false;
    }
}

function readQrFrame() {
    if (scannerVideo.readyState !== scannerVideo.HAVE_ENOUGH_DATA) {
        return;
    }

    scannerCanvas.width = scannerVideo.videoWidth;
    scannerCanvas.height = scannerVideo.videoHeight;
    const context = scannerCanvas.getContext('2d');
    context.drawImage(scannerVideo, 0, 0, scannerCanvas.width, scannerCanvas.height);
    const imageData = context.getImageData(0, 0, scannerCanvas.width, scannerCanvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (!code) {
        return;
    }

    clearInterval(scanTimer);
    if (navigator.vibrate) {
        navigator.vibrate(120);
    }

    try {
        handleHandshake(JSON.parse(code.data));
    } catch (error) {
        console.error(error);
    }
}

async function handleHandshake(payload) {
    laptopIp = payload.ip;
    token = payload.token;
    sessionLabel.textContent = `Connected to ${laptopIp}`;
    settingsHost.textContent = laptopIp;

    stopScanner();

    const timeline = gsap.timeline();
    browserScreen.classList.remove('hidden');
    connectScreen.classList.add('hidden');

    timeline.to('#connect-window', {
        duration: 0.45,
        opacity: 0,
        y: -28,
        ease: 'power2.inOut'
    });
    timeline.set(connectScreen, { display: 'none' });
    timeline.set(browserScreen, { display: 'block', opacity: 0, y: 18 });
    timeline.to(browserScreen, {
        duration: 0.7,
        opacity: 1,
        y: 0,
        ease: 'expo.out'
    });

    setPane('browse');
    await loadRemoteFiles('/');
}

function stopScanner() {
    clearInterval(scanTimer);
    if (scannerVideo.srcObject) {
        scannerVideo.srcObject.getTracks().forEach((track) => track.stop());
        scannerVideo.srcObject = null;
    }
}

async function loadRemoteFiles(path) {
    currentPath = path;
    currentPathMobile.textContent = currentPath;
    currentDirLabel.textContent = basename(currentPath) || 'Workstation';
    settingsFolder.textContent = currentPath;
    btnBackDir.disabled = isRootPath(currentPath);

    try {
        const response = await fetch(`http://${laptopIp}:3000/api/files?path=${encodeURIComponent(path)}&token=${token}`);
        const files = await response.json();
        currentItems = sortFiles(files);
        renderFiles(filterCurrentItems());
    } catch (error) {
        console.error(error);
        sessionLabel.textContent = 'Connection interrupted';
    }
}

function sortFiles(files) {
    return [...files].sort((a, b) => {
        if (a.kind === 'folder' && b.kind !== 'folder') {
            return -1;
        }
        if (a.kind !== 'folder' && b.kind === 'folder') {
            return 1;
        }
        return a.name.localeCompare(b.name);
    });
}

function filterCurrentItems() {
    const query = mobileSearch.value.trim().toLowerCase();
    if (!query) {
        return currentItems;
    }

    return currentItems.filter((file) => file.name.toLowerCase().includes(query));
}

function renderFiles(files) {
    fileList.innerHTML = '';
    const showEmpty = files.length === 0;
    browserEmpty.classList.toggle('hidden', !showEmpty);
    browseCount.textContent = `${files.length} item${files.length === 1 ? '' : 's'}`;
    clearMobileSearchBtn.classList.toggle('hidden', mobileSearch.value.trim() === '');

    if (showEmpty) {
        return;
    }

    const renderId = ++thumbnailVersion;

    files.forEach((file) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `file-card ${file.kind === 'folder' ? 'is-folder' : ''}`;
        card.innerHTML = `
            <div class="file-visual">${getFileIcon(file.kind)}</div>
            <div class="file-name">${escapeHtml(file.name)}</div>
            <div class="file-meta">
                <span class="file-tag">${labelKind(file.kind)}</span>
                <span>${formatSize(file.size)}</span>
            </div>
        `;

        card.addEventListener('click', () => handleFileTap(file));
        fileList.appendChild(card);

        if (file.kind === 'image') {
            hydrateThumbnail(file, card.querySelector('.file-visual'), renderId);
        }
    });
}

async function hydrateThumbnail(file, container, renderId) {
    try {
        const response = await fetch(`http://${laptopIp}:3000/api/thumbnail?path=${encodeURIComponent(file.path)}&token=${token}`);
        if (!response.ok || renderId !== thumbnailVersion) {
            return;
        }

        const payload = await response.json();
        if (payload.thumbnail) {
            container.innerHTML = `<img src="data:image/jpeg;base64,${payload.thumbnail}" alt="${escapeHtml(file.name)}">`;
        }
    } catch (error) {
        console.error(error);
    }
}

function handleFileTap(file) {
    if (file.kind === 'folder') {
        loadRemoteFiles(file.path);
        return;
    }

    recordTransfer({
        id: `download-${Date.now()}`,
        name: file.name,
        status: 'ready',
        transferred: file.size,
        total: file.size
    });

    window.open(`http://${laptopIp}:3000/api/file?path=${encodeURIComponent(file.path)}&token=${token}`, '_blank');
}

function setPane(paneName) {
    currentPane = paneName;
    Object.entries(panes).forEach(([name, pane]) => {
        pane.classList.toggle('hidden', name !== paneName);
    });

    dockItems.forEach((item) => {
        item.classList.toggle('is-active', item.dataset.pane === paneName);
    });
}

function recordTransfer(entry) {
    const existing = uploads.get(entry.id) || {};
    uploads.set(entry.id, {
        ...existing,
        ...entry,
        updatedAt: Date.now()
    });
    renderTransfers();
}

function renderTransfers() {
    const items = [...uploads.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    transferCountMobile.textContent = `${items.length} upload${items.length === 1 ? '' : 's'}`;

    if (items.length === 0) {
        mobileTransferList.innerHTML = `
            <div class="transfer-empty">
                <strong>No uploads yet</strong>
                <p>Use the plus button to send files to the desktop.</p>
            </div>
        `;
        return;
    }

    mobileTransferList.innerHTML = items.map((item) => {
        const total = item.total || 0;
        const progress = total > 0 ? Math.min(100, Math.round((item.transferred / total) * 100)) : item.status === 'done' ? 100 : 12;
        return `
            <article class="transfer-item">
                <div class="transfer-item-header">
                    <strong>${escapeHtml(item.name)}</strong>
                    <span class="transfer-status ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
                </div>
                <div class="transfer-item-meta">
                    <span>${formatSize(item.transferred)}${total ? ` / ${formatSize(total)}` : ''}</span>
                    <span>${progress}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width:${progress}%"></div>
                </div>
            </article>
        `;
    }).join('');
}

async function uploadFiles(files) {
    if (!files.length || !laptopIp || !token) {
        return;
    }

    setPane('transfers');

    for (const file of files) {
        await uploadSingleFile(file);
    }

    fileInput.value = '';
    loadRemoteFiles(currentPath);
}

function uploadSingleFile(file) {
    return new Promise((resolve) => {
        const id = `upload-${file.name}-${Date.now()}`;
        const formData = new FormData();
        formData.append('file', file, file.name);

        recordTransfer({
            id,
            name: file.name,
            status: 'queued',
            transferred: 0,
            total: file.size
        });

        const request = new XMLHttpRequest();
        request.open('POST', `http://${laptopIp}:3000/api/upload?path=${encodeURIComponent(currentPath)}&token=${token}`);

        request.upload.onprogress = (event) => {
            recordTransfer({
                id,
                name: file.name,
                status: 'uploading',
                transferred: event.loaded,
                total: event.total || file.size
            });
        };

        request.onload = () => {
            recordTransfer({
                id,
                name: file.name,
                status: request.status >= 200 && request.status < 300 ? 'done' : 'failed',
                transferred: file.size,
                total: file.size
            });
            resolve();
        };

        request.onerror = () => {
            recordTransfer({
                id,
                name: file.name,
                status: 'failed',
                transferred: 0,
                total: file.size
            });
            resolve();
        };

        request.send(formData);
    });
}

function resetSession() {
    stopScanner();
    currentPath = '/';
    token = '';
    laptopIp = '';
    currentItems = [];
    uploads.clear();
    mobileSearch.value = '';
    currentPathMobile.textContent = '/';
    currentDirLabel.textContent = 'Workstation';
    sessionLabel.textContent = 'Waiting to connect';
    settingsHost.textContent = 'Not connected';
    settingsFolder.textContent = '/';
    btnBackDir.disabled = true;
    browseCount.textContent = '0 items';
    renderTransfers();

    browserScreen.classList.add('hidden');
    connectScreen.classList.remove('hidden');
    connectScreen.style.display = 'block';
    browserScreen.style.display = 'none';
    btnScanStart.textContent = 'Start Camera Scan';
    btnScanStart.disabled = false;

    gsap.fromTo('#connect-window', {
        opacity: 0,
        y: 28
    }, {
        duration: 0.6,
        opacity: 1,
        y: 0,
        ease: 'expo.out'
    });
}

function goToParentDirectory() {
    if (isRootPath(currentPath)) {
        return;
    }

    const nextPath = parentPath(currentPath);
    mobileSearch.value = '';
    clearMobileSearchBtn.classList.add('hidden');
    loadRemoteFiles(nextPath);
}

function parentPath(path) {
    const normalized = String(path).replace(/\\/g, '/').replace(/\/$/, '');
    if (normalized === '/' || /^[A-Za-z]:$/.test(normalized)) {
        return path;
    }

    const parts = normalized.split('/').filter(Boolean);
    if (parts.length === 0) {
        return '/';
    }

    if (/^[A-Za-z]:$/.test(parts[0])) {
        if (parts.length === 1) {
            return `${parts[0]}/`;
        }
        parts.pop();
        return parts.length === 1 ? `${parts[0]}/` : `${parts.join('/')}`;
    }

    parts.pop();
    return `/${parts.join('/')}` || '/';
}

function isRootPath(path) {
    const normalized = String(path).replace(/\\/g, '/').replace(/\/$/, '');
    return normalized === '' || normalized === '/' || /^[A-Za-z]:$/.test(normalized);
}

function basename(path) {
    const normalized = String(path).replace(/\\/g, '/').replace(/\/$/, '');
    if (/^[A-Za-z]:$/.test(normalized)) {
        return normalized;
    }
    const parts = normalized.split('/').filter(Boolean);
    return parts.at(-1) || path;
}

function formatSize(bytes) {
    if (!bytes) {
        return '--';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }

    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function getFileIcon(kind) {
    switch (kind) {
        case 'folder':
            return '📁';
        case 'image':
            return '🖼️';
        case 'video':
            return '🎬';
        case 'audio':
            return '🎵';
        case 'archive':
            return '🧰';
        case 'document':
            return '📄';
        default:
            return '·';
    }
}

function labelKind(kind) {
    switch (kind) {
        case 'folder':
            return 'Folder';
        case 'image':
            return 'Image';
        case 'video':
            return 'Video';
        case 'audio':
            return 'Audio';
        case 'archive':
            return 'Archive';
        case 'document':
            return 'Document';
        default:
            return 'File';
    }
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

btnScanStart.addEventListener('click', startScan);
btnBackDir.addEventListener('click', goToParentDirectory);
btnUpload.addEventListener('click', () => fileInput.click());
btnRescan.addEventListener('click', resetSession);
fileInput.addEventListener('change', () => uploadFiles([...fileInput.files]));
mobileSearch.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        renderFiles(filterCurrentItems());
    }, 120);
});
clearMobileSearchBtn.addEventListener('click', () => {
    mobileSearch.value = '';
    renderFiles(filterCurrentItems());
});
dockItems.forEach((item) => {
    item.addEventListener('click', () => setPane(item.dataset.pane));
});

init();
