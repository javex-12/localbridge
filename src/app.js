const { invoke } = window.__TAURI__ ? window.__TAURI__.core : { invoke: () => {} };
const { listen } = window.__TAURI__ ? window.__TAURI__.event : { listen: () => {} };

const qrCodeEl = document.getElementById('qr-code');
const networkAddressEl = document.getElementById('network-address');
const connectionStatusEl = document.getElementById('connection-status');
const fileBrowser = document.getElementById('file-browser');
const currentPathEl = document.getElementById('current-path');
const searchInput = document.getElementById('search-input');
const transferList = document.getElementById('transfer-list');
const emptyState = document.getElementById('empty-state');
const fileCountEl = document.getElementById('file-count');
const fileSummaryEl = document.getElementById('file-summary');
const transferCountEl = document.getElementById('transfer-count');
const transferSummaryEl = document.getElementById('transfer-summary');
const btnBack = document.getElementById('btn-back');
const btnHome = document.getElementById('btn-home');
const btnRefresh = document.getElementById('btn-refresh');
const btnGrid = document.getElementById('btn-grid');
const btnList = document.getElementById('btn-list');
const clearSearchBtn = document.getElementById('btn-clear-search');

let currentPath = '';
let homePath = '';
let currentItems = [];
let currentView = 'grid';
let searchNonce = 0;
let searchTimer = null;
let isSearching = false;
const transfers = new Map();

function setupListeners() {
    if (btnBack) {
        btnBack.addEventListener('click', () => {
            const p = currentPath.split(/[\\/]/).filter(Boolean);
            p.pop();
            loadFiles(p.length === 0 ? '/' : '/' + p.join('/'));
        });
    }
    if (btnHome) btnHome.addEventListener('click', () => loadFiles(homePath));
    if (btnRefresh) btnRefresh.addEventListener('click', () => loadFiles(currentPath));
    if (btnGrid) btnGrid.addEventListener('click', () => setView('grid'));
    if (btnList) btnList.addEventListener('click', () => setView('list'));
    
    if (searchInput) {
        searchInput.addEventListener('input', triggerSearch);
    }
    
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => { 
            if (searchInput) searchInput.value = ''; 
            triggerSearch(); 
        });
    }

    const btnShowQr = document.getElementById('btn-show-qr');
    const btnCloseQr = document.getElementById('btn-close-qr');
    const qrModal = document.getElementById('qr-modal');
    const modalBackdrop = document.querySelector('.modal-backdrop');

    if (btnShowQr && qrModal) {
        btnShowQr.addEventListener('click', () => qrModal.classList.remove('hidden'));
    }
    if (btnCloseQr && qrModal) {
        btnCloseQr.addEventListener('click', () => qrModal.classList.add('hidden'));
    }
    if (modalBackdrop && qrModal) {
        modalBackdrop.addEventListener('click', () => qrModal.classList.add('hidden'));
    }
}

async function init() {
    try {
        console.log("Initializing Workstation...");
        setupListeners();
        
        homePath = "/"; 
        currentPath = homePath;
        updatePathDisplay();

        // Safety check for Tauri global
        if (!window.__TAURI__) {
            console.error("Tauri API not found! Are you running in a browser?");
            if (document.getElementById('hero-hint')) {
                document.getElementById('hero-hint').textContent = "ERROR: System Bridge Not Found";
            }
            return;
        }

        const [info, network] = await Promise.all([
            invoke('get_connection_info'),
            invoke('get_network_status')
        ]);

        if (qrCodeEl) qrCodeEl.innerHTML = info.svg;
        
        const tokenDisp = document.getElementById('security-token-display');
        if (tokenDisp) tokenDisp.textContent = info.token;
        
        const pairDisp = document.getElementById('pairing-code-display');
        if (pairDisp) pairDisp.textContent = info.pairing_code || '------';
        
        const pairSide = document.getElementById('pairing-code-sidebar');
        if (pairSide) pairSide.textContent = info.pairing_code || '------';
        
        hydrateNetworkUI(network);

        await loadFiles(currentPath);
        await listen('transfer-progress', (event) => {
            updateTransferUI(event.payload);
        });
    } catch (error) {
        console.error("Initialization Failed:", error);
    }
}

function hydrateNetworkUI(network) {
    const modeLabel = network.mode === 'hotspot' ? 'Hotspot' : 'Local';
    if (document.getElementById('network-badge')) {
        document.getElementById('network-badge').textContent = network.ssid || 'Active LAN';
    }
    if (networkAddressEl) networkAddressEl.textContent = network.ip || '--';
    if (document.getElementById('hero-network')) {
        document.getElementById('hero-network').textContent = `${modeLabel.toUpperCase()} BRIDGE`;
    }
    if (document.getElementById('hero-hint')) {
        document.getElementById('hero-hint').textContent = `Sync Engine Listening on ${network.ip || 'LAN'}`;
    }
}

async function loadFiles(path) {
    try {
        const files = await invoke('list_files', { path });
        currentPath = path;
        currentItems = sortFiles(files);
        updatePathDisplay();
        renderFiles(currentItems);
    } catch (error) {
        console.error(error);
    }
}

function sortFiles(files) {
    return [...files].sort((a, b) => {
        if (a.kind === 'folder' && b.kind !== 'folder') return -1;
        if (a.kind !== 'folder' && b.kind === 'folder') return 1;
        return a.name.localeCompare(b.name);
    });
}

function renderFiles(files) {
    fileBrowser.innerHTML = '';
    const showEmpty = files.length === 0;
    emptyState.classList.toggle('hidden', !showEmpty);

    if (showEmpty) {
        fileCountEl.textContent = '0 items';
        fileSummaryEl.textContent = 'No Items Found';
        return;
    }

    const folderCount = files.filter((file) => file.kind === 'folder').length;
    fileCountEl.textContent = `${files.length} ITEMS`;
    fileSummaryEl.textContent = `${folderCount} DIR / ${files.length - folderCount} FILE`;

    const isList = currentView === 'list';
    fileBrowser.className = isList 
        ? 'flex flex-col gap-1' 
        : 'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3';

    files.forEach((file, i) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `file-card group relative flex ${isList ? 'flex-row items-center gap-4 px-4 py-2' : 'flex-col p-4'} rounded-2xl border border-white/5 hover:border-blue-500/20 text-left animate-in`;
        item.style.animationDelay = `${i * 15}ms`;
        
        const iconColor = getIconColor(file.kind);
        
        item.innerHTML = isList ? `
            <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-500/10 text-${iconColor}-400 group-hover:bg-blue-600 group-hover:text-white transition-all">
                ${getFileIcon(file.kind)}
            </div>
            <div class="flex-1 min-w-0">
                <div class="text-[12px] font-bold text-slate-200 truncate group-hover:text-white transition-colors">${escapeHtml(file.name)}</div>
            </div>
            <div class="text-[9px] font-black text-slate-600 uppercase tracking-widest group-hover:text-blue-500 transition-colors">
                ${file.kind === 'folder' ? 'DIR' : formatSize(file.size)}
            </div>
        ` : `
            <div class="w-10 h-10 rounded-xl flex items-center justify-center mb-4 bg-white/5 text-${iconColor}-400 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-inner">
                ${getFileIcon(file.kind)}
            </div>
            <div class="text-[11px] font-bold text-slate-300 truncate mb-1 group-hover:text-white transition-colors uppercase tracking-tight">${escapeHtml(file.name)}</div>
            <div class="text-[9px] font-black text-slate-600 uppercase tracking-widest">${file.kind === 'folder' ? 'Folder' : formatSize(file.size)}</div>
            <div class="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <i data-lucide="${file.kind === 'folder' ? 'chevron-right' : 'zap'}" class="w-3 h-3 text-blue-500"></i>
            </div>
        `;

        item.addEventListener('click', () => handleFileClick(file, item));
        fileBrowser.appendChild(item);
    });
}

function handleFileClick(file, item) {
    document.querySelectorAll('.file-card').forEach((node) => node.classList.remove('active', 'border-blue-500/50'));
    item.classList.add('active', 'border-blue-500/50');

    if (file.kind === 'folder') {
        searchInput.value = '';
        clearSearchBtn.classList.add('hidden');
        isSearching = false;
        loadFiles(file.path);
    }
}

function updatePathDisplay() {
    currentPathEl.textContent = currentPath;
    btnBack.disabled = isRootPath(currentPath);
}

function setView(mode) {
    currentView = mode;
    btnGrid.className = `p-1.5 rounded-md ${mode === 'grid' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white transition-colors'}`;
    btnList.className = `p-1.5 rounded-md ${mode === 'list' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white transition-colors'}`;
    renderFiles(currentItems);
}

function updateTransferUI(data) {
    const existing = transfers.get(data.id) || {
        id: data.id,
        filename: data.filename || 'INCOMING',
        transferred: 0,
        status: 'queued',
        updatedAt: Date.now()
    };

    existing.filename = data.filename || existing.filename;
    existing.transferred = data.transferred ?? existing.transferred;
    existing.status = data.status || existing.status;
    existing.updatedAt = Date.now();
    transfers.set(data.id, existing);

    const ordered = [...transfers.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    transferCountEl.textContent = `${ordered.length} SIGNALS`;
    transferSummaryEl.textContent = ordered.some(t => t.status === 'transferring') ? 'SYNC IN PROGRESS' : 'IDLE';

    transferList.innerHTML = ordered.map((entry) => {
        const isDone = entry.status === 'done';
        const pct = isDone ? 100 : 40;

        return `
            <article class="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 animate-in">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDone ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-400'}">
                    <i data-lucide="${isDone ? 'check' : 'activity'}" class="w-4 h-4"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-center mb-1.5">
                        <div class="text-[11px] font-bold text-slate-200 truncate mr-4 uppercase tracking-tighter">${escapeHtml(entry.filename)}</div>
                        <span class="text-[9px] font-black uppercase tracking-widest ${isDone ? 'text-emerald-500' : 'text-blue-500'}">${escapeHtml(entry.status)}</span>
                    </div>
                    <div class="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                        <div class="h-full ${isDone ? 'bg-emerald-500' : 'bg-blue-500 animate-pulse'} transition-all duration-700" style="width:${pct}%"></div>
                    </div>
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
            loadFiles(currentPath);
            return;
        }

        try {
            isSearching = true;
            clearSearchBtn.classList.remove('hidden');
            const results = await invoke('search', { query, root: currentPath });
            if (nonce !== searchNonce) return;
            renderFiles(sortFiles(results));
        } catch (error) {
            console.error(error);
        }
    }, 200);
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
    return `<i data-lucide="${icon}" class="w-4 h-4"></i>`;
}

function formatSize(bytes) {
    if (!bytes) return '--';
    const units = ['B', 'KB', 'MB', 'GB'];
    let v = bytes, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function escapeHtml(v) { return String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function basename(path) { return path.split(/[\\/]/).filter(Boolean).pop() || ''; }
function isRootPath(path) { return path === '/' || !path || path.endsWith(':'); }

window.addEventListener('DOMContentLoaded', init);