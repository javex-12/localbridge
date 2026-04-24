let currentPath = '/';
let token = '';
let laptopIp = '';

const connectScreen = document.getElementById('connect-screen');
const browserScreen = document.getElementById('browser-screen');
const fileList = document.getElementById('file-list');
const currentDirLabel = document.getElementById('current-dir-label');

// --- AURA ENGINE (GPU Background) ---
const canvas = document.getElementById('aura-canvas');
const ctx = canvas.getContext('2d');
let w, h;
const particles = [];

function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
}

window.addEventListener('resize', resize);
resize();

class AuraParticle {
    constructor() {
        this.init();
    }
    init() {
        this.x = Math.random() * w;
        this.y = Math.random() * h;
        this.size = Math.random() * 300 + 100;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.color = `hsla(${Math.random() * 60 + 210}, 70%, 40%, 0.15)`;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < -this.size) this.x = w + this.size;
        if (this.x > w + this.size) this.x = -this.size;
        if (this.y < -this.size) this.y = h + this.size;
        if (this.y > h + this.size) this.y = -this.size;
    }
    draw() {
        const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
        grad.addColorStop(0, this.color);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

for (let i = 0; i < 8; i++) particles.push(new AuraParticle());

function animateAura() {
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'screen';
    particles.forEach(p => {
        p.update();
        p.draw();
    });
    requestAnimationFrame(animateAura);
}
animateAura();

// --- CORE LOGIC ---
function init() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js');
    }

    // GSAP Intro
    const tl = gsap.timeline({ defaults: { ease: "expo.out", duration: 1.5 } });
    tl.from("#setup-window", { y: 100, opacity: 0, scale: 0.9 })
      .from(".status-dock", { y: 50, opacity: 0 }, "-=1")
      .from(".window-chrome", { opacity: 0 }, "-=0.8");

    checkSetup();
}

async function startScan() {
    const video = document.getElementById('scanner-video');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = stream;
        video.play();
        
        gsap.to("#btn-scan-start", { opacity: 0.5, pointerEvents: "none" });
        
        // Scan polling
        const scanTimer = setInterval(() => {
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                const qrCanvas = document.getElementById('scanner-canvas');
                qrCanvas.height = video.videoHeight;
                qrCanvas.width = video.videoWidth;
                const qrCtx = qrCanvas.getContext('2d');
                qrCtx.drawImage(video, 0, 0, qrCanvas.width, qrCanvas.height);
                const imgData = qrCtx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
                const code = jsQR(imgData.data, imgData.width, imgData.height);
                
                if (code) {
                    clearInterval(scanTimer);
                    handleHandshake(JSON.parse(code.data));
                }
            }
        }, 200);
    } catch (e) {
        alert("Camera required for pro-link.");
    }
}

async function handleHandshake(payload) {
    laptopIp = payload.ip;
    token = payload.token;
    
    // Stop camera
    const video = document.getElementById('scanner-video');
    if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());

    if (window.navigator.vibrate) window.navigator.vibrate(100);

    // Dynamic Transition
    const tl = gsap.timeline();
    tl.to("#setup-window", { duration: 0.6, scale: 1.1, opacity: 0, ease: "power2.in" })
      .to(".status-dock", { duration: 0.4, y: 100, opacity: 0 }, "-=0.3")
      .set(connectScreen, { display: "none" })
      .set(browserScreen, { display: "flex", opacity: 0 })
      .to(browserScreen, { duration: 1, opacity: 1, ease: "power3.out" });

    loadRemoteFiles('/');
}

async function loadRemoteFiles(path) {
    currentPath = path;
    const label = path === '/' ? 'Workstation' : path.split(/[\\\/]/).filter(Boolean).pop();
    currentDirLabel.textContent = label || 'Workstation';

    try {
        const res = await fetch(`http://${laptopIp}:3000/api/files?path=${encodeURIComponent(path)}&token=${token}`);
        const files = await res.json();
        renderFiles(files);
    } catch (e) {
        console.error("Link unstable", e);
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
        card.className = 'file-card-pro';
        card.style.opacity = '0';
        card.innerHTML = `
            <div class="f-icon-wrap">${getFileIcon(file.kind)}</div>
            <div class="f-name">${file.name}</div>
            <div class="f-size">${formatSize(file.size)}</div>
        `;
        card.onclick = () => {
            gsap.to(card, { scale: 0.9, duration: 0.1, yoyo: true, repeat: 1 });
            if (file.kind === 'folder') {
                loadRemoteFiles(file.path);
            } else {
                window.open(`http://${laptopIp}:3000/api/file?path=${encodeURIComponent(file.path)}&token=${token}`, '_blank');
            }
        };
        fileList.appendChild(card);
    });

    gsap.to(".file-card-pro", {
        duration: 0.8,
        opacity: 1,
        y: 0,
        stagger: 0.05,
        startAt: { y: 20 },
        ease: "power2.out"
    });
}

function getFileIcon(kind) {
    switch (kind) {
        case 'folder': return '📂';
        case 'image': return '🖼️';
        case 'video': return '🎬';
        case 'audio': return '🎵';
        default: return '📄';
    }
}

function formatSize(bytes) {
    if (bytes === 0) return '--';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function checkSetup() {
    if (navigator.onLine) document.getElementById('pill-wifi').classList.add('ready');
    navigator.mediaDevices.enumerateDevices().then(devices => {
        if (devices.some(d => d.kind === 'videoinput')) document.getElementById('pill-camera').classList.add('ready');
    });
}

document.getElementById('btn-scan-start').onclick = startScan;
document.getElementById('btn-back-dir').onclick = () => {
    const parts = currentPath.split(/[\\\/]/).filter(Boolean);
    parts.pop();
    const newPath = parts.join('/') || '/';
    loadRemoteFiles(newPath.startsWith('/') ? newPath : '/' + newPath);
};

init();