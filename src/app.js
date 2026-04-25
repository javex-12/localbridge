const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const qrCodeEl = document.getElementById('qr-code');
const networkBadge = document.getElementById('network-badge');
const networkModeEl = document.getElementById('network-mode');
const networkAddressEl = document.getElementById('network-address');
const workspacePathEl = document.getElementById('workspace-path');
const connectionStatusEl = document.getElementById('connection-status');
const fileBrowser = document.getElementById('file-browser');
const currentPathEl = document.getElementById('current-path');
const currentDirLabel = document.getElementById('current-dir-label');
const browserCaption = document.getElementById('browser-caption');
const searchInput = document.getElementById('search-input');
const transferList = document.getElementById('transfer-list');
const emptyState = document.getElementById('empty-state');
const heroNetworkEl = document.getElementById('hero-network');
const heroHintEl = document.getElementById('hero-hint');
const fileCountEl = document.getElementById('file-count');
const fileSummaryEl = document.getElementById('file-summary');
const transferCountEl = document.getElementById('transfer-count');
const transferSummaryEl = document.getElementById('transfer-summary');
const clearSearchBtn = document.getElementById('btn-clear-search');
const btnBack = document.getElementById('btn-back');
const btnHome = document.getElementById('btn-home');
const btnRefresh = document.getElementById('btn-refresh');
const btnGrid = document.getElementById('btn-grid');
const btnList = document.getElementById('btn-list');

let currentPath = '';
let homePath = '';
let currentItems = [];
let currentView = 'grid';
let selectedPath = '';
let searchNonce = 0;
let searchTimer = null;
let isSearching = false;
const transfers = new Map();

async function init() {
    try {
        homePath = await invoke('get_home_dir');
        currentPath = homePath;
        workspacePathEl.textContent = homePath;
        updatePathDisplay();

        const [info, network] = await Promise.all([
            invoke('get_connection_info'),
            invoke('get_network_status')
        ]);

        qrCodeEl.innerHTML = info.svg;
        hydrateNetworkUI(network);

        await loadFiles(currentPath);
        await listen('transfer-progress', (event) => {
            updateTransferUI(event.payload);
        });
    } catch (error) {
        console.error(error);
        heroNetworkEl.textContent = 'Initialization failed';
        heroHintEl.textContent = 'Restart the app or inspect the Rust backend.';
    }
}

function hydrateNetworkUI(network) {
    const modeLabel = network.mode === 'hotspot'
        ? 'Hotspot'
        : network.mode === 'wifi'
            ? 'Wi-Fi'
            : 'Local';

    const badgeLabel = network.ssid ? `SSID ${network.ssid}` : network.ip;
    networkBadge.textContent = badgeLabel;
    networkModeEl.textContent = modeLabel;
    networkAddressEl.textContent = network.ip || '-';
    heroNetworkEl.textContent = `${modeLabel} session ready`;

    if (network.ssid && network.password) {
        heroHintEl.textContent = `Join ${network.ssid} with password ${network.password} and scan the QR code from the phone.`;
    } else {
        heroHintEl.textContent = 'Keep both devices on the same local network, then scan the pairing QR from the PWA.';
    }
}

async function loadFiles(path) {
    try {
        const files = await invoke('list_files', { path });
        currentPath = path;
        currentItems = sortFiles(files);
        selectedPath = '';
        updatePathDisplay();
        renderFiles(currentItems);
    } catch (error) {
        console.error(error);
        alert(`Failed to load files: ${error}`);
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

function renderFiles(files) {
    fileBrowser.innerHTML = '';
    const showEmpty = files.length === 0;
    emptyState.classList.toggle('hidden', !showEmpty);

    if (showEmpty) {
        fileCountEl.textContent = '0 items';
        fileSummaryEl.textContent = isSearching
            ? `No matches in ${basename(currentPath)}`
            : 'This folder is empty.';
        return;
    }

    const folderCount = files.filter((file) => file.kind === 'folder').length;
    const fileCount = files.length - folderCount;
    fileCountEl.textContent = `${files.length} item${files.length === 1 ? '' : 's'}`;
    fileSummaryEl.textContent = `${folderCount} folder${folderCount === 1 ? '' : 's'} and ${fileCount} file${fileCount === 1 ? '' : 's'} in view.`;

    files.forEach((file) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'file-item';
        item.innerHTML = `
            <div class="file-icon-wrap">${getFileIcon(file.kind)}</div>
            <div class="file-main">
                <div class="file-name">${escapeHtml(file.name)}</div>
                <div class="file-meta">
                    <span>${labelKind(file.kind)}</span>
                    <span>${formatSize(file.size)}</span>
                    <span>${formatDate(file.modified)}</span>
                </div>
            </div>
            <div class="file-action">${file.kind === 'folder' ? 'Open' : 'Available to phone'}</div>
        `;

        item.addEventListener('click', () => handleFileClick(file, item));
        fileBrowser.appendChild(item);
    });
}

function handleFileClick(file, item) {
    document.querySelectorAll('.file-item.is-selected').forEach((node) => {
        node.classList.remove('is-selected');
    });
    item.classList.add('is-selected');
    selectedPath = file.path;

    if (file.kind === 'folder') {
        searchInput.value = '';
        clearSearchBtn.classList.add('hidden');
        isSearching = false;
        browserCaption.textContent = `Browsing ${file.name}. Files inside this folder are exposed to the connected phone.`;
        loadFiles(file.path);
        return;
    }

    browserCaption.textContent = `${file.name} is ready for the mobile client to download through the current link.`;
}

function updatePathDisplay() {
    currentPathEl.textContent = currentPath;
    currentDirLabel.textContent = basename(currentPath) || currentPath;
    btnBack.disabled = isRootPath(currentPath);
}

function setView(mode) {
    currentView = mode;
    fileBrowser.classList.toggle('grid-view', mode === 'grid');
    fileBrowser.classList.toggle('list-view', mode === 'list');
    btnGrid.classList.toggle('is-active', mode === 'grid');
    btnList.classList.toggle('is-active', mode === 'list');
}

function updateTransferUI(data) {
    const existing = transfers.get(data.id) || {
        id: data.id,
        filename: data.filename || 'Incoming file',
        transferred: 0,
        status: 'queued',
        updatedAt: Date.now()
    };

    existing.filename = data.filename || existing.filename;
    existing.transferred = data.transferred ?? existing.transferred;
    existing.status = data.status || existing.status;
    existing.updatedAt = Date.now();
    transfers.set(data.id, existing);

    if (existing.status === 'transferring' || existing.status === 'done') {
        connectionStatusEl.textContent = 'Phone activity detected';
    }

    const ordered = [...transfers.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    transferCountEl.textContent = `${ordered.length} transfer${ordered.length === 1 ? '' : 's'}`;

    const activeTransfers = ordered.filter((entry) => entry.status === 'transferring').length;
    transferSummaryEl.textContent = activeTransfers > 0
        ? `${activeTransfers} active upload${activeTransfers === 1 ? '' : 's'} in progress.`
        : 'Recent uploads remain visible here.';

    transferList.innerHTML = ordered.map((entry) => {
        const isDone = entry.status === 'done';
        const isFailed = entry.status === 'failed';
        const progressClass = isDone ? '' : 'is-indeterminate';
        const progressWidth = isDone ? '100%' : '38%';

        return `
            <article class="transfer-item">
                <div class="transfer-row">
                    <div class="transfer-name">${escapeHtml(entry.filename)}</div>
                    <span class="transfer-status ${escapeHtml(entry.status)}">${escapeHtml(entry.status)}</span>
                </div>
                <div class="transfer-meta">
                    <span>${formatSize(entry.transferred)}</span>
                    <span>${isFailed ? 'Upload failed' : isDone ? 'Upload complete' : 'Receiving from phone'}</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill ${progressClass}" style="width:${progressWidth};"></div>
                </div>
            </article>
        `;
    }).join('');
}

function triggerSearch() {
    const query = searchInput.value.trim();
    const nonce = ++searchNonce;
    clearTimeout(searchTimer);

    searchTimer = setTimeout(async () => {
        if (query === '') {
            isSearching = false;
            clearSearchBtn.classList.add('hidden');
            browserCaption.textContent = 'Folders open in place. Files remain available to the mobile client through the current session.';
            loadFiles(currentPath);
            return;
        }

        try {
            isSearching = true;
            clearSearchBtn.classList.remove('hidden');
            const results = await invoke('search', { query, root: currentPath });
            if (nonce !== searchNonce) {
                return;
            }
            browserCaption.textContent = `Showing matches for "${query}" inside ${basename(currentPath)}.`;
            renderFiles(sortFiles(results));
        } catch (error) {
            console.error(error);
        }
    }, 180);
}

function goToParent() {
    if (isRootPath(currentPath)) {
        return;
    }
    const nextPath = parentPath(currentPath);
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    isSearching = false;
    browserCaption.textContent = 'Folders open in place. Files remain available to the mobile client through the current session.';
    loadFiles(nextPath);
}

function basename(path) {
    const normalized = String(path).replace(/\\/g, '/').replace(/\/$/, '');
    if (/^[A-Za-z]:$/.test(normalized)) {
        return normalized;
    }
    const parts = normalized.split('/').filter(Boolean);
    return parts.at(-1) || path;
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

function formatDate(value) {
    if (!value) {
        return 'Unknown date';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'Unknown date';
    }

    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    }).format(date);
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
        case 'document':
            return 'Document';
        case 'archive':
            return 'Archive';
        default:
            return 'File';
    }
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

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

btnBack.addEventListener('click', goToParent);
btnHome.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    isSearching = false;
    loadFiles(homePath);
});
btnRefresh.addEventListener('click', () => {
    triggerSearch();
});
btnGrid.addEventListener('click', () => setView('grid'));
btnList.addEventListener('click', () => setView('list'));
searchInput.addEventListener('input', triggerSearch);
clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    triggerSearch();
});

setView('grid');
init();
