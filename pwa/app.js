let currentPath = '/';
let token = '';
let laptopIp = '';

// DOM Elements
const connectScreen = document.getElementById('connect-screen');
const browserScreen = document.getElementById('browser-screen');
const video = document.getElementById('scanner-video');
const canvas = document.getElementById('scanner-canvas');
const fileList = document.getElementById('file-list');
const currentDirLabel = document.getElementById('current-dir-label');

function init() {
    // Register Service Worker for true offline capability
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').then(() => {
            console.log("LocalBridge Core: Offline Ready");
        });
    }

    // Initial hardware reveal
    const masterTl = gsap.timeline({ defaults: { ease: "expo.out" } });
    
    masterTl.from(".wallpaper-bg", { duration: 2, scale: 1.2, filter: "blur(0px)", opacity: 0 })
           .from(".mac-window", { duration: 1.4, y: 80, scale: 0.95, opacity: 0 }, "-=1.5")
           .from(".dock", { duration: 1.2, y: 100, opacity: 0 }, "-=1.0")
           .from(".window-header", { duration: 0.8, opacity: 0 }, "-=0.8");

    checkSetup();
}

async function startScan() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = stream;
        video.play();
        requestAnimationFrame(tick);
        
        gsap.to("#btn-scan-start", { opacity: 0.5, pointerEvents: "none" });
    } catch (e) {
        alert("Permission Error: Ensure camera access is granted.");
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
            if (window.navigator.vibrate) window.navigator.vibrate(200);
            transitionToBrowser(JSON.parse(code.data));
            return;
        }
    }
    requestAnimationFrame(tick);
}

async function transitionToBrowser(payload) {
    laptopIp = payload.ip;
    token = payload.token;
    
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
    }

    // GSAP Transition
    const tl = gsap.timeline();
    tl.to(".mac-window", { duration: 0.5, scale: 0.9, opacity: 0, ease: "power2.in" })
      .to(".dock-wrap", { duration: 0.5, y: 100, opacity: 0, ease: "power2.in" }, "-=0.3")
      .set(connectScreen, { display: "none" })
      .set(browserScreen, { display: "flex", opacity: 0 })
      .to(browserScreen, { duration: 0.8, opacity: 1, ease: "power2.out" });

    loadRemoteFiles('/');
}

async function loadRemoteFiles(path) {
    currentPath = path;
    currentDirLabel.textContent = path === '/' ? 'Workstation' : path.split('/').pop();
    
    try {
        const res = await fetch(`http://${laptopIp}:3000/api/files?path=${encodeURIComponent(path)}&token=${token}`);
        const files = await res.json();
        renderFiles(files);
        
        gsap.from(".pro-card", {
            duration: 0.6,
            y: 20,
            opacity: 0,
            stagger: 0.05,
            ease: "power2.out"
        });
    } catch (e) {
        console.error("Link unstable", e);
    }
}

function renderFiles(files) {
    fileList.innerHTML = '';
    
    // Sort logic
    files.sort((a, b) => {
        if (a.kind === 'folder' && b.kind !== 'folder') return -1;
        if (a.kind !== 'folder' && b.kind === 'folder') return 1;
        return a.name.localeCompare(b.name);
    });

    files.forEach(file => {
        const card = document.createElement('div');
        card.className = 'pro-card';
        card.style.opacity = "0"; // Start hidden for GSAP
        card.innerHTML = `
            <div class="icon-box">${getFileIcon(file.kind)}</div>
            <div class="name-label">${file.name}</div>
            <div class="size-label">${formatSize(file.size)}</div>
        `;
        card.onclick = () => {
            gsap.to(card, { scale: 0.95, duration: 0.1, yoyo: true, repeat: 1 });
            if (file.kind === 'folder') {
                loadRemoteFiles(file.path);
            } else {
                window.open(`http://${laptopIp}:3000/api/file?path=${encodeURIComponent(file.path)}&token=${token}`, '_blank');
            }
        };
        fileList.appendChild(card);
    });

    // Staggered Liquid Entry
    gsap.to(".pro-card", {
        duration: 0.8,
        opacity: 1,
        y: 0,
        scale: 1,
        stagger: {
            each: 0.04,
            from: "start"
        },
        startAt: { y: 30, scale: 0.9 },
        ease: "elastic.out(1, 0.8)"
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

document.getElementById('btn-scan-start').onclick = startScan;
document.getElementById('btn-back-dir').onclick = () => {
    const parts = currentPath.split(/[\\\/]/).filter(Boolean);
    parts.pop();
    const newPath = parts.join('/') || '/';
    loadRemoteFiles(newPath.startsWith('/') ? newPath : '/' + newPath);
};

init();
