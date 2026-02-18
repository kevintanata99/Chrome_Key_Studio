// State Variables
const state = {
    img: null,
    originalData: null,
    targetColor: { r: 0, g: 255, b: 0 }, 
    mode: 'global', // 'global' or 'magic'
    magicPoints: [], // Array of {x, y, color}
    tolerance: 40,
    erode: 0,
    feather: 0,
    zoom: 1.0,
    alphaBuffer: null // Reusable buffer for performance
};

// History Management
const history = [];
let historyIndex = -1;
const MAX_HISTORY = 20;

// DOM Elements
const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const scrollWrapper = document.getElementById('scrollWrapper');
const canvasContainer = document.getElementById('canvasContainer');
const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

// UI Elements
const emptyState = document.getElementById('emptyState');
const loadingState = document.getElementById('loadingState');
const canvasHelperText = document.getElementById('canvasHelperText');
const modeDesc = document.getElementById('modeDesc');
const clickInstruction = document.getElementById('clickInstruction');
const zoomToolbar = document.getElementById('zoomToolbar');
const zoomLevelDisplay = document.getElementById('zoomLevelDisplay');
const pickerTooltip = document.getElementById('pickerTooltip');

// Controls
const colorPicker = document.getElementById('colorPicker');
const toleranceRange = document.getElementById('toleranceRange');
const erodeRange = document.getElementById('erodeRange');
const featherRange = document.getElementById('featherRange');
const downloadBtn = document.getElementById('downloadBtn');
const btnUndo = document.getElementById('btnUndo');
const btnRedo = document.getElementById('btnRedo');

// Mobile Controls
const toleranceRangeMobile = document.getElementById('toleranceRangeMobile');
const featherRangeMobile = document.getElementById('featherRangeMobile');
const downloadBtnMobile = document.getElementById('downloadBtnMobile');

// History System

function saveState() {
    if (historyIndex < history.length - 1) {
        history.length = historyIndex + 1;
    }

    const snapshot = {
        targetColor: { ...state.targetColor },
        mode: state.mode,
        magicPoints: state.magicPoints.map(p => ({...p})), 
        tolerance: state.tolerance,
        erode: state.erode,
        feather: state.feather
    };

    history.push(snapshot);
    if (history.length > MAX_HISTORY) history.shift();
    else historyIndex++;

    updateUndoRedoUI();
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        applyState(history[historyIndex]);
        updateUndoRedoUI();
    }
}

function redo() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        applyState(history[historyIndex]);
        updateUndoRedoUI();
    }
}

function applyState(snapshot) {
    state.targetColor = { ...snapshot.targetColor };
    state.mode = snapshot.mode;
    state.magicPoints = snapshot.magicPoints.map(p => ({...p})); 
    state.tolerance = snapshot.tolerance;
    state.erode = snapshot.erode;
    state.feather = snapshot.feather;

    // Sync UI
    colorPicker.value = rgbToHex(state.targetColor.r, state.targetColor.g, state.targetColor.b);
    
    toleranceRange.value = state.tolerance;
    toleranceRangeMobile.value = state.tolerance;
    document.getElementById('toleranceVal').textContent = state.tolerance;
    if(document.getElementById('mobToleranceVal')) document.getElementById('mobToleranceVal').textContent = state.tolerance;
    
    erodeRange.value = state.erode;
    document.getElementById('erodeVal').textContent = state.erode;

    featherRange.value = state.feather;
    featherRangeMobile.value = state.feather;
    document.getElementById('featherVal').textContent = state.feather;

    setModeUIOnly(state.mode); 
    processImage();
}

function updateUndoRedoUI() {
    btnUndo.disabled = historyIndex <= 0;
    btnRedo.disabled = historyIndex >= history.length - 1;
    btnUndo.style.opacity = btnUndo.disabled ? '0.3' : '1';
    btnRedo.style.opacity = btnRedo.disabled ? '0.3' : '1';
}

// Zoom System
scrollWrapper.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY;
        if (delta < 0) zoomIn();
        else zoomOut();
    }
}, { passive: false });

function zoomIn() { setZoom(state.zoom + 0.25); }
function zoomOut() { setZoom(state.zoom - 0.25); }

function resetZoom() {
    if (!state.img) return;
    const wrapperW = scrollWrapper.clientWidth;
    const wrapperH = scrollWrapper.clientHeight;
    const imgW = state.img.naturalWidth;
    const imgH = state.img.naturalHeight;
    
    const scaleW = (wrapperW - 40) / imgW;
    const scaleH = (wrapperH - 40) / imgH;
    let newZoom = Math.min(scaleW, scaleH);
    if(newZoom > 1) newZoom = 1;
    setZoom(newZoom);
}

function setZoom(val) {
    if (val < 0.1) val = 0.1;
    if (val > 5.0) val = 5.0;
    state.zoom = val;
    zoomLevelDisplay.textContent = Math.round(val * 100) + '%';
    const newW = state.img.naturalWidth * val;
    const newH = state.img.naturalHeight * val;
    canvas.style.width = `${newW}px`;
    canvas.style.height = `${newH}px`;
}

// Mode Handling
window.setMode = function(mode) {
    if (state.mode !== mode) {
        state.mode = mode;
        setModeUIOnly(mode);
        if (mode === 'global') state.magicPoints = [];
        saveState();
        processImage();
    }
}

function setModeUIOnly(mode) {
    const btnGlobal = document.getElementById('modeGlobal');
    const btnMagic = document.getElementById('modeMagic');
    const mobGlobal = document.getElementById('mobModeGlobal');
    const mobMagic = document.getElementById('mobModeMagic');
    
    // Element for disabling color picker
    const colorPicker = document.getElementById('colorPicker');
    const pickerTooltip = document.getElementById('pickerTooltip');

    // Styling classes updated for Dark Mode compatibility
    const activeClass = "bg-white dark:bg-gray-600 shadow text-indigo-700 dark:text-indigo-300 font-semibold";
    const inactiveClass = "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200";

    // Mobile classes
    const mobActive = "bg-white dark:bg-gray-600 text-indigo-700 dark:text-indigo-300 shadow font-bold";
    const mobInactive = "text-gray-500 dark:text-gray-400 font-medium";

    if (mode === 'global') {
        btnGlobal.className = "flex-1 py-2 px-2 rounded-md transition " + activeClass;
        btnMagic.className = "flex-1 py-2 px-2 rounded-md transition " + inactiveClass;
        
        mobGlobal.className = "flex-1 py-1 text-xs rounded transition " + mobActive;
        mobMagic.className = "flex-1 py-1 text-xs rounded transition " + mobInactive;
        
        modeDesc.textContent = "Menghapus warna yang dipilih di seluruh area gambar.";
        clickInstruction.textContent = "Klik gambar atau pilih kotak warna manual.";
        canvasHelperText.textContent = "Klik area warna yang ingin dihapus";
        
        // Enable Color Picker
        colorPicker.disabled = false;
        if(pickerTooltip) pickerTooltip.classList.add('hidden');

    } else {
        // Magic Mode
        btnGlobal.className = "flex-1 py-2 px-2 rounded-md transition " + inactiveClass;
        btnMagic.className = "flex-1 py-2 px-2 rounded-md transition " + activeClass;

        mobGlobal.className = "flex-1 py-1 text-xs rounded transition " + mobInactive;
        mobMagic.className = "flex-1 py-1 text-xs rounded transition " + mobActive;
        
        modeDesc.textContent = "Klik di gambar untuk hapus area spesifik. (Color Picker dinonaktifkan)";
        clickInstruction.textContent = "Warna otomatis terdeteksi saat klik gambar.";
        canvasHelperText.textContent = "✨ Klik + untuk tambah area hapus";
        
        // Disable Color Picker
        colorPicker.disabled = true;
        if(pickerTooltip) pickerTooltip.classList.remove('hidden');
    }
}

// Event Listeners
fileInput.addEventListener('change', handleFileSelect);

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if(e.dataTransfer.types.includes('Files')) {
        dropZone.classList.add('bg-indigo-50');
        dropZone.classList.add('dark:bg-gray-800');
    }
});
dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('bg-indigo-50');
    dropZone.classList.remove('dark:bg-gray-800');
});
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('bg-indigo-50');
    dropZone.classList.remove('dark:bg-gray-800');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});

colorPicker.addEventListener('change', (e) => {
    if (state.mode === 'magic') return;
    const newColor = hexToRgb(e.target.value);
    state.targetColor = newColor;
    saveState();
    requestAnimationFrame(processImage);
});

colorPicker.addEventListener('input', (e) => {
    if (state.mode === 'magic') return;
    const newColor = hexToRgb(e.target.value);
    state.targetColor = newColor;
    if (state.mode === 'global') {
        requestAnimationFrame(processImage);
    } 
});

canvas.addEventListener('mousedown', (e) => {
    if (!state.img) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    const newColor = { r: pixel[0], g: pixel[1], b: pixel[2] };

    state.targetColor = newColor;
    colorPicker.value = rgbToHex(pixel[0], pixel[1], pixel[2]);
    
    if (state.mode === 'magic') {
        state.magicPoints.push({ x, y, color: newColor });
        canvasHelperText.textContent = "✨ Memproses Magic Wand...";
    }
    
    saveState();
    setTimeout(() => {
            processImage();
            if (state.mode === 'magic') canvasHelperText.textContent = `✨ ${state.magicPoints.length} Area Dihapus. Klik lagi untuk tambah.`;
    }, 10);
});

// Sliders
toleranceRange.addEventListener('input', (e) => {
    document.getElementById('toleranceVal').textContent = e.target.value;
    if(document.getElementById('mobToleranceVal')) document.getElementById('mobToleranceVal').textContent = e.target.value;
    state.tolerance = parseInt(e.target.value);
    requestAnimationFrame(processImage);
});
toleranceRange.addEventListener('change', () => saveState());

toleranceRangeMobile.addEventListener('input', (e) => {
    document.getElementById('toleranceVal').textContent = e.target.value;
    if(document.getElementById('mobToleranceVal')) document.getElementById('mobToleranceVal').textContent = e.target.value;
    toleranceRange.value = e.target.value;
    state.tolerance = parseInt(e.target.value);
    requestAnimationFrame(processImage);
});
toleranceRangeMobile.addEventListener('change', () => saveState());

erodeRange.addEventListener('input', (e) => {
    document.getElementById('erodeVal').textContent = e.target.value;
    state.erode = parseInt(e.target.value);
    requestAnimationFrame(processImage);
});
erodeRange.addEventListener('change', () => saveState());

featherRange.addEventListener('input', (e) => {
    document.getElementById('featherVal').textContent = e.target.value;
    featherRangeMobile.value = e.target.value;
    state.feather = parseInt(e.target.value);
    requestAnimationFrame(processImage);
});
featherRange.addEventListener('change', () => saveState());

featherRangeMobile.addEventListener('input', (e) => {
    document.getElementById('featherVal').textContent = e.target.value;
    featherRange.value = e.target.value;
    state.feather = parseInt(e.target.value);
    requestAnimationFrame(processImage);
});
featherRangeMobile.addEventListener('change', () => saveState());

downloadBtn.addEventListener('click', downloadImage);
downloadBtnMobile.addEventListener('click', downloadImage);

window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
});

function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.classList.toggle('dark');
    updateThemeIcon(isDark);
}

function updateThemeIcon(isDark) {
    const iconSun = document.getElementById('iconSun');
    const iconMoon = document.getElementById('iconMoon');
    
    if (!iconSun || !iconMoon) return;

    if (isDark) {
        // Mode Gelap Aktif
        iconSun.classList.remove('hidden');
        iconMoon.classList.add('hidden');
    } else {
        // Mode Terang Aktif
        iconSun.classList.add('hidden');
        iconMoon.classList.remove('hidden');
    }
}

// Initialize Theme
updateThemeIcon(document.documentElement.classList.contains('dark'));


function handleFileSelect(e) { if (e.target.files.length) handleFile(e.target.files[0]); }

function handleFile(file) {
    if (!file.type.match('image.*')) {
        alert("Hey, ini bukan file gambar.");
        return;
    }
    loadingState.classList.remove('hidden');
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            state.img = img;
            ctx.drawImage(img, 0, 0);
            state.originalData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            state.alphaBuffer = new Uint8Array(canvas.width * canvas.height).fill(255);

            const cornerPixel = ctx.getImageData(0, 0, 1, 1).data;
            state.targetColor = { r: cornerPixel[0], g: cornerPixel[1], b: cornerPixel[2] };
            colorPicker.value = rgbToHex(cornerPixel[0], cornerPixel[1], cornerPixel[2]);

            emptyState.classList.add('hidden');
            scrollWrapper.classList.remove('hidden');
            zoomToolbar.classList.remove('hidden');
            downloadBtn.disabled = false;
            downloadBtnMobile.disabled = false;
            
            history.length = 0;
            historyIndex = -1;
            state.magicPoints = [];
            setModeUIOnly('magic'); 
            state.mode = 'magic';
            resetZoom(); 
            saveState(); 
            processImage();
            loadingState.classList.add('hidden');
        }
        img.src = event.target.result;
    }
    reader.readAsDataURL(file);
}

function processImage() {
    if (!state.originalData) return;

    const width = state.originalData.width;
    const height = state.originalData.height;
    const totalPixels = width * height;

    if (!state.alphaBuffer || state.alphaBuffer.length !== totalPixels) {
        state.alphaBuffer = new Uint8Array(totalPixels);
    }

    const alphaMask = state.alphaBuffer;
    alphaMask.fill(255);

    const srcData = state.originalData.data; 

    // Generate Base Alpha Mask
    if (state.mode === 'global') {
        processGlobalMask(srcData, alphaMask);
    } else {
        if (state.magicPoints.length > 0) {
            state.magicPoints.forEach(point => {
                processMagicWandMask(srcData, alphaMask, width, height, point);
            });
        }
    }

    // Post Processing
    let finalAlpha = alphaMask; 

    if (state.erode > 0 || state.feather > 0) {
            const tempBuffer = new Uint8Array(alphaMask); 
            
            if (state.erode > 0) {
                applyErode(tempBuffer, width, height, state.erode);
            }
            if (state.feather > 0) {
                applyFeather(tempBuffer, width, height, state.feather);
            }
            finalAlpha = tempBuffer;
    }

    // Render
    const output = ctx.createImageData(width, height);
    const dst = output.data;

    for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        dst[idx] = srcData[idx];     // R
        dst[idx+1] = srcData[idx+1]; // G
        dst[idx+2] = srcData[idx+2]; // B
        dst[idx+3] = finalAlpha[i];  // A from mask
    }

    ctx.putImageData(output, 0, 0);
}

function processGlobalMask(srcData, alphaMask) {
    const len = alphaMask.length;
    const { r: tr, g: tg, b: tb } = state.targetColor;
    const tol = state.tolerance; 
    
    for (let i = 0; i < len; i++) {
        const idx = i * 4;
        const r = srcData[idx];
        const g = srcData[idx + 1];
        const b = srcData[idx + 2];

        const dist = Math.sqrt((r - tr)**2 + (g - tg)**2 + (b - tb)**2);

        if (dist < tol) {
            alphaMask[i] = 0;
        } else {
            alphaMask[i] = 255;
        }
    }
}

function processMagicWandMask(srcData, alphaMask, width, height, pointData) {
    const { x: startX, y: startY, color } = pointData;
    const tr = color.r;
    const tg = color.g;
    const tb = color.b;
    const tol = state.tolerance;
    
    const stack = [startX, startY];
    const visited = new Uint8Array(width * height); 
    
    if(startX < 0 || startX >= width || startY < 0 || startY >= height) return;

    function match(idx) {
        const pos = idx * 4;
        const r = srcData[pos];
        const g = srcData[pos+1];
        const b = srcData[pos+2];
        const dist = Math.sqrt((r - tr)**2 + (g - tg)**2 + (b - tb)**2);
        return dist <= tol;
    }

    while (stack.length > 0) {
        const y = stack.pop();
        const x = stack.pop();
        const idx = y * width + x;
        
        if (visited[idx]) continue;
        visited[idx] = 1;

        if (match(idx)) {
            alphaMask[idx] = 0;

            if (x > 0 && !visited[idx-1]) stack.push(x - 1, y);
            if (x < width - 1 && !visited[idx+1]) stack.push(x + 1, y);
            if (y > 0 && !visited[idx-width]) stack.push(x, y - 1);
            if (y < height - 1 && !visited[idx+width]) stack.push(x, y + 1);
        }
    }
}

function applyErode(buffer, width, height, radius) {
    const len = buffer.length;
    const temp = new Uint8Array(len);
    for (let iter = 0; iter < radius; iter++) {
        temp.set(buffer); 
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = y * width + x;
                if (temp[i] === 0) continue; 
                let minVal = temp[i];
                if (x > 0) minVal = Math.min(minVal, temp[i-1]);
                if (x < width-1) minVal = Math.min(minVal, temp[i+1]);
                if (y > 0) minVal = Math.min(minVal, temp[i-width]);
                if (y < height-1) minVal = Math.min(minVal, temp[i+width]);
                buffer[i] = minVal;
            }
        }
    }
}

function applyFeather(buffer, width, height, radius) {
    if (radius === 0) return;
    const len = buffer.length;
    const temp = new Float32Array(len); 
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0;
            let count = 0;
            for (let k = -radius; k <= radius; k++) {
                const px = x + k;
                if (px >= 0 && px < width) {
                    sum += buffer[y * width + px];
                    count++;
                }
            }
            temp[y * width + x] = sum / count;
        }
    }
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            let sum = 0;
            let count = 0;
            for (let k = -radius; k <= radius; k++) {
                const py = y + k;
                if (py >= 0 && py < height) {
                    sum += temp[py * width + x];
                    count++;
                }
            }
            buffer[y * width + x] = Math.floor(sum / count);
        }
    }
}

function downloadImage() {
    const link = document.createElement('a');
    link.download = 'edited.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
}

function resetApp() {
    state.img = null;
    state.originalData = null;
    fileInput.value = '';
    state.magicPoints = [];
    history.length = 0;
    historyIndex = -1;
    emptyState.classList.remove('hidden');
    scrollWrapper.classList.add('hidden');
    zoomToolbar.classList.add('hidden');
    downloadBtn.disabled = true;
    downloadBtnMobile.disabled = true;
    updateUndoRedoUI();
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : {r:0, g:255, b:0};
}

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
