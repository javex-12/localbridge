let connection = null;
let currentPath = '';
let token = '';
let laptopIp = '';

const connectScreen = document.getElementById('connect-screen');
const browserScreen = document.getElementById('browser-screen');
const video = document.getElementById('scanner-video');
const canvas = document.getElementById('scanner-canvas');
const fileList = document.getElementById('file-list');
const currentDirEl = document.getElementById('current-dir');

async function init() {
    checkSetup();
}

async function startScan() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream;
    video.setAttribute('playsinline', true);
    video.play();
    requestAnimationFrame(tick);
}

function tick() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
        });

        if (code) {
            console.log('Found QR code', code.data);
            handleConnect(JSON.parse(code.data));
            return;
        }
    }
    requestAnimationFrame(tick);
}

async function handleConnect(payload) {
    laptopIp = payload.ip;
    token = payload.token;
    
    // Stop video
    video.srcObject.getTracks().forEach(track => track.stop());
    
    // Switch UI
    connectScreen.classList.add('hidden');
    browserScreen.classList.remove('hidden');
    
    // Connect WS
    const wsUrl = `ws://${laptopIp}:${payload.port}/ws?token=${token}`;
    connection = new WebSocket(wsUrl);
    
    connection.onopen = () => {
        console.log('Connected to laptop');
        loadRemoteFiles('/');
    };
}

async function loadRemoteFiles(path) {
    currentPath = path;
    currentDirEl.textContent = path;
    
    const res = await fetch(`http://${laptopIp}:3000/api/files?path=${encodeURIComponent(path)}&token=${token}`);
    const files = await res.json();
    renderFiles(files);
}

function renderFiles(files) {
    fileList.innerHTML = '';
    
    // Back button
    if (currentPath !== '/') {
        const back = document.createElement('div');
        back.className = 'file-item';
        back.innerHTML = `<div class="file-icon">📁</div><div class="file-name">..</div>`;
        back.onclick = () => {
             const parts = currentPath.split('/').filter(Boolean);
             parts.pop();
             loadRemoteFiles('/' + parts.join('/'));
        };
        fileList.appendChild(back);
    }

    files.forEach(file => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `
            <div class="file-icon">${getFileIcon(file.kind)}</div>
            <div class="file-name">${file.name}</div>
        `;
        item.onclick = () => {
            if (file.kind === 'folder') {
                loadRemoteFiles(file.path);
            } else {
                previewFile(file);
            }
        };
        fileList.appendChild(item);
    });
}

function getFileIcon(kind) {
    switch (kind) {
        case 'folder': return '📁';
        case 'image': return '🖼️';
        case 'video': return '🎬';
        default: return '📄';
    }
}

function checkSetup() {
    document.getElementById('check-wifi').textContent = navigator.onLine ? '✅ Wi-Fi Active' : '❌ No Network';
    navigator.mediaDevices.enumerateDevices().then(devices => {
        const hasCam = devices.some(d => d.kind === 'videoinput');
        document.getElementById('check-camera').textContent = hasCam ? '✅ Camera Ready' : '❌ No Camera';
    });
}

document.getElementById('btn-scan').onclick = startScan;

init();
