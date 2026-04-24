let connection = null;
let currentPath = '/';
let token = '';
let laptopIp = '';

const connectScreen = document.getElementById('connect-screen');
const browserScreen = document.getElementById('browser-screen');
const video = document.getElementById('scanner-video');
const canvas = document.getElementById('scanner-canvas');
const fileList = document.getElementById('file-list');
const currentDirLabel = document.getElementById('current-dir-label');

function init() {
    checkSetup();
}

async function startScan() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = stream;
        video.play();
        requestAnimationFrame(tick);
    } catch (e) {
        alert("Camera permission required for scanning.");
    }
}

function tick() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code) {
            hapticFeedback();
            handleConnect(JSON.parse(code.data));
            return;
        }
    }
    requestAnimationFrame(tick);
}

function hapticFeedback() {
    if (window.navigator.vibrate) window.navigator.vibrate(50);
}

async function handleConnect(payload) {
    laptopIp = payload.ip;
    token = payload.token;
    
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
    }
    
    connectScreen.classList.add('hidden');
    browserScreen.classList.remove('hidden');
    
    loadRemoteFiles('/');
}

async function loadRemoteFiles(path) {
    currentPath = path;
    currentDirLabel.textContent = path === '/' ? 'Root' : path.split('/').pop();
    
    try {
        const res = await fetch(`http://${laptopIp}:3000/api/files?path=${encodeURIComponent(path)}&token=${token}`);
        const files = await res.json();
        renderFiles(files);
    } catch (e) {
        console.error("Fetch failed", e);
    }
}

function renderFiles(files) {
    fileList.innerHTML = '';
    
    files.sort((a, b) => {
        if (a.kind === 'folder' && b.kind !== 'folder') return -1;
        if (a.kind !== 'folder' && b.kind === 'folder') return 1;
        return a.name.localeCompare(b.name);
    }).forEach(file => {
        const card = document.createElement('div');
        card.className = 'file-card';
        card.innerHTML = `
            <div class="file-icon-box">${getFileIcon(file.kind)}</div>
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-meta">${formatSize(file.size)}</div>
            </div>
        `;
        card.onclick = () => {
            if (file.kind === 'folder') {
                loadRemoteFiles(file.path);
            } else {
                downloadFile(file);
            }
        };
        fileList.appendChild(card);
    });
}

function getFileIcon(kind) {
    switch (kind) {
        case 'folder': return '􀈕';
        case 'image': return '􀏅';
        case 'video': return '􀑩';
        case 'audio': return '􀑪';
        default: return '􀈷';
    }
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function downloadFile(file) {
    const url = `http://${laptopIp}:3000/api/file?path=${encodeURIComponent(file.path)}&token=${token}`;
    window.open(url, '_blank');
}

function checkSetup() {
    const wifiPill = document.getElementById('check-wifi');
    const camPill = document.getElementById('check-camera');
    
    if (navigator.onLine) wifiPill.classList.add('ready');
    
    navigator.mediaDevices.enumerateDevices().then(devices => {
        if (devices.some(d => d.kind === 'videoinput')) camPill.classList.add('ready');
    });
}

document.getElementById('btn-scan').onclick = startScan;
document.getElementById('btn-back-dir').onclick = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    loadRemoteFiles('/' + parts.join('/'));
};

init();