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

    const isList = currentView === 'list';
    fileBrowser.className = isList 
        ? 'flex flex-col gap-2' 
        : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4';

    files.forEach((file, i) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `file-item group relative flex ${isList ? 'flex-row items-center gap-4 p-3' : 'flex-col p-5'} glass rounded-2xl border border-white/5 text-left`;
        item.style.animation = `cellIn 0.3s ease-out both ${i * 20}ms`;
        
        const iconColor = getIconColor(file.kind);
        
        item.innerHTML = isList ? `
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-${iconColor}-500/10 text-${iconColor}-400">
                ${getFileIcon(file.kind)}
            </div>
            <div class="flex-1 min-w-0">
                <div class="text-xs font-bold text-white truncate">${escapeHtml(file.name)}</div>
                <div class="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase mt-0.5">
                    <span>${labelKind(file.kind)}</span>
                    <span class="w-1 h-1 rounded-full bg-slate-800"></span>
                    <span>${formatSize(file.size)}</span>
                </div>
            </div>
            <div class="text-[10px] font-black text-slate-600 uppercase tracking-widest group-hover:text-emerald-500 transition-colors">
                ${file.kind === 'folder' ? 'Open' : 'Link Live'}
            </div>
        ` : `
            <div class="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 bg-${iconColor}-500/10 text-${iconColor}-400 group-hover:bg-${iconColor}-500 group-hover:text-white transition-all">
                ${getFileIcon(file.kind)}
            </div>
            <div class="text-xs font-bold text-white truncate mb-1">${escapeHtml(file.name)}</div>
            <div class="text-[10px] text-slate-500 font-bold uppercase">${formatSize(file.size)}</div>
            <div class="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                 <div class="w-6 h-6 rounded-lg bg-emerald-500 text-white flex items-center justify-center">
                    <i data-lucide="${file.kind === 'folder' ? 'arrow-right' : 'link'}" class="w-3 h-3"></i>
                 </div>
            </div>
        `;

        item.addEventListener('click', () => handleFileClick(file, item));
        fileBrowser.appendChild(item);
    });
}

function getIconColor(kind) {
    switch (kind) {
        case 'folder': return 'amber';
        case 'image': return 'blue';
        case 'video': return 'purple';
        case 'audio': return 'rose';
        case 'archive': return 'orange';
        case 'document': return 'emerald';
        default: return 'slate';
    }
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
        connectionStatusEl.textContent = 'Phone Active';
        connectionStatusEl.className = 'px-2 py-0.5 rounded-full bg-emerald-500/20 text-[9px] font-black uppercase text-emerald-500';
    }

    const ordered = [...transfers.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    transferCountEl.textContent = `${ordered.length} transfer${ordered.length === 1 ? '' : 's'}`;

    const activeTransfers = ordered.filter((entry) => entry.status === 'transferring').length;
    transferSummaryEl.textContent = activeTransfers > 0
        ? `${activeTransfers} uploads in progress.`
        : 'Session history remains visible.';

    transferList.innerHTML = ordered.map((entry) => {
        const isDone = entry.status === 'done';
        const isFailed = entry.status === 'failed';
        const pct = isDone ? 100 : 38;

        return `
            <article class="glass p-4 rounded-2xl border border-white/5 flex items-center gap-4">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDone ? 'bg-emerald-500 text-white' : 'bg-blue-500/10 text-blue-400'}">
                    <i data-lucide="${isDone ? 'check' : 'upload-cloud'}" class="w-5 h-5"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-center mb-1.5">
                        <div class="text-xs font-bold text-white truncate mr-4">${escapeHtml(entry.filename)}</div>
                        <span class="text-[9px] font-black uppercase tracking-widest ${isDone ? 'text-emerald-500' : 'text-blue-400'}">${escapeHtml(entry.status)}</span>
                    </div>
                    <div class="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div class="h-full ${isDone ? 'bg-emerald-500' : 'bg-blue-500 animate-pulse'} transition-all duration-500" style="width:${pct}%"></div>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

function setView(mode) {
    currentView = mode;
    btnGrid.className = `w-9 h-9 rounded-lg flex items-center justify-center transition-all ${mode === 'grid' ? 'bg-emerald-500 text-white' : 'text-slate-500 hover:text-white'}`;
    btnList.className = `w-9 h-9 rounded-lg flex items-center justify-center transition-all ${mode === 'list' ? 'bg-emerald-500 text-white' : 'text-slate-500 hover:text-white'}`;
    renderFiles(currentItems);
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
    return `<i data-lucide="${icon}" class="w-full h-full"></i>`;
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

// Modal UI logic
const btnShowQr = document.getElementById('btn-show-qr');
const btnCloseQr = document.getElementById('btn-close-qr');
const qrModal = document.getElementById('qr-modal');
const modalBackdrop = document.querySelector('.modal-backdrop');

btnShowQr.addEventListener('click', () => qrModal.classList.remove('hidden'));
btnCloseQr.addEventListener('click', () => qrModal.classList.add('hidden'));
modalBackdrop.addEventListener('click', () => qrModal.classList.add('hidden'));

setView('grid');
init();
