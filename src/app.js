const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const qrCodeEl = document.getElementById('qr-code');
const networkBadge = document.getElementById('network-badge');
const fileBrowser = document.getElementById('file-browser');
const currentPathEl = document.getElementById('current-path');
const searchInput = document.getElementById('search-input');
const transferList = document.getElementById('transfer-list');

let currentPath = '';

async function init() {
    // Get initial path
    currentPath = await invoke('get_home_dir');
    updatePathDisplay();
    
    // Get connection info
    const info = await invoke('get_connection_info');
    qrCodeEl.innerHTML = info.svg;
    networkBadge.textContent = info.ssid ? `📡 ${info.ssid}` : `📶 ${info.ip}`;

    // Load files
    loadFiles(currentPath);

    // Listen for transfers
    listen('transfer-progress', (event) => {
        updateTransferUI(event.payload);
    });
}

async function loadFiles(path) {
    try {
        const files = await invoke('list_files', { path });
        renderFiles(files);
    } catch (e) {
        console.error(e);
        alert('Failed to load files: ' + e);
    }
}

function renderFiles(files) {
    fileBrowser.innerHTML = '';
    
    // Add "Back" button if not at root
    if (currentPath.length > 3) { // Simple check for Windows/Unix root
        const backItem = document.createElement('div');
        backItem.className = 'file-item';
        backItem.innerHTML = `
            <div class="file-icon">📁</div>
            <div class="file-name">..</div>
        `;
        backItem.onclick = () => {
            const parts = currentPath.split(/[\/]/).filter(Boolean);
            parts.pop();
            currentPath = parts.join('/') || '/';
            if (currentPath === '/') currentPath = 'C:/'; // Windows hack
            updatePathDisplay();
            loadFiles(currentPath);
        };
        fileBrowser.appendChild(backItem);
    }

    files.sort((a, b) => {
        if (a.kind === 'folder' && b.kind !== 'folder') return -1;
        if (a.kind !== 'folder' && b.kind === 'folder') return 1;
        return a.name.localeCompare(b.name);
    }).forEach(file => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `
            <div class="file-icon">${getFileIcon(file.kind)}</div>
            <div class="file-name">${file.name}</div>
        `;
        item.onclick = () => {
            if (file.kind === 'folder') {
                currentPath = file.path;
                updatePathDisplay();
                loadFiles(currentPath);
            }
        };
        fileBrowser.appendChild(item);
    });
}

function getFileIcon(kind) {
    switch (kind) {
        case 'folder': return '📁';
        case 'image': return '🖼️';
        case 'video': return '🎬';
        case 'audio': return '🎵';
        case 'document': return '📄';
        case 'archive': return '📦';
        default: return '📄';
    }
}

function updatePathDisplay() {
    currentPathEl.textContent = currentPath;
}

function updateTransferUI(data) {
    let item = document.getElementById(`transfer-${data.id}`);
    if (!item) {
        item = document.createElement('div');
        item.id = `transfer-${data.id}`;
        item.className = 'transfer-item';
        transferList.appendChild(item);
    }
    
    // We'd need more info for full UI, but for now:
    item.innerHTML = `
        <div class="transfer-info">
            <span>Uploading...</span>
            <span>${(data.transferred / 1024 / 1024).toFixed(2)} MB</span>
        </div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: 100%"></div>
        </div>
    `;
}

searchInput.oninput = async () => {
    if (searchInput.value.trim() === '') {
        loadFiles(currentPath);
        return;
    }
    const results = await invoke('search', { query: searchInput.value, root: currentPath });
    renderFiles(results);
};

init();
