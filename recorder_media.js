/**
 * RECORDER_MEDIA.JS (Optimized Compression Edition + Async Download Fix)
 */

window.isRecording = false; 
window.lastCursorLogTime = 0;
window.recordStartTime = 0; 
window.jsonDrawingTimelineLog = [];
let masterAudioVideoRecorder = null; 
let compiledRecordingChunks = [];
let systemClockTimer = null; 
let elapsedRecordingSeconds = 0;

// Hardware state defaults
let isCameraHardwareOn = false; 
let isAudioHardwareOn = false; 
let isCameraPermissionGranted = false;
let isMicrophonePermissionGranted = false;
let isRequestingPermissions = false;

// DOM Elements
const liveBadge = document.getElementById('btnLiveToggle');
const camVideoFeed = document.getElementById('webcamVideoFeed');
const mixCanvas = document.getElementById('hiddenStudioMixCanvas');
const mixCtx = mixCanvas.getContext('2d');
const btnMute = document.getElementById('btnMute');
const btnToggleCam = document.getElementById('btnToggleCam');
const camPlaceholderText = document.getElementById('camPlaceholderText');
const orientOverlay = document.getElementById('orientationOverlay'); 
let localHardwareAVStream = null;

// Initial UI state: Camera "Off" visual
camVideoFeed.style.opacity = '0';
btnMute.classList.add('is-muted');

async function requestHardwarePermissions() {
    if (isRequestingPermissions) return false;
    isRequestingPermissions = true;
    
    try { 
        localHardwareAVStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); 
        camVideoFeed.srcObject = localHardwareAVStream;
        
        isCameraPermissionGranted = true; 
        isMicrophonePermissionGranted = true;
        isCameraHardwareOn = true;
        isAudioHardwareOn = true;
        
        camVideoFeed.style.opacity = '1';
        btnMute.classList.remove('is-muted');
        document.getElementById('camHardwareErrorNotice').classList.add('hidden');
        if (camPlaceholderText) camPlaceholderText.style.display = 'none';
        
        isRequestingPermissions = false;
        return true;
    } catch (e) { 
        isCameraHardwareOn = false; 
        isAudioHardwareOn = false; 
        isCameraPermissionGranted = false; 
        isMicrophonePermissionGranted = false;
        
        const errorNotice = document.getElementById('camHardwareErrorNotice');
        errorNotice.innerText = "Camera/Mic access denied. Please check your browser permissions.";
        errorNotice.classList.remove('hidden');
        
        if (camPlaceholderText) camPlaceholderText.style.display = 'none';
        
        isRequestingPermissions = false;
        return false;
    }
}

btnToggleCam.addEventListener('click', async () => { 
    if (!localHardwareAVStream && !isCameraPermissionGranted) {
        await requestHardwarePermissions();
        return; 
    }
    if (!isCameraPermissionGranted) {
        document.getElementById('camHardwareErrorNotice').classList.remove('hidden');
        return;
    }
    isCameraHardwareOn = !isCameraHardwareOn; 
    camVideoFeed.style.opacity = isCameraHardwareOn ? '1' : '0'; 
    
    if (camPlaceholderText) {
        camPlaceholderText.style.display = isCameraHardwareOn ? 'none' : 'flex';
        camPlaceholderText.innerHTML = '📷 Camera Off<br><span>Audio is controlled separately</span>';
    }

    if (localHardwareAVStream) {
        localHardwareAVStream.getVideoTracks().forEach(track => track.enabled = isCameraHardwareOn);
    }
});

btnMute.addEventListener('click', async (e) => { 
    if (!localHardwareAVStream && !isMicrophonePermissionGranted) {
        await requestHardwarePermissions();
        return;
    }
    if (!isMicrophonePermissionGranted) {
        document.getElementById('camHardwareErrorNotice').classList.remove('hidden');
        return;
    }
    isAudioHardwareOn = !isAudioHardwareOn; 
    e.target.classList.toggle('is-muted', !isAudioHardwareOn);
    if (localHardwareAVStream) {
        localHardwareAVStream.getAudioTracks().forEach(track => {
            track.enabled = isAudioHardwareOn;
        });
    }
});

function processBackgroundMediaCompositor() {
    if (!window.isRecording) return;
    
    if (isCameraHardwareOn && isCameraPermissionGranted && camVideoFeed.srcObject) {
        mixCtx.drawImage(camVideoFeed, 0, 0, 640, 360);
    } else { 
        mixCtx.fillStyle = '#000000'; 
        mixCtx.fillRect(0, 0, 640, 360); 
        mixCtx.fillStyle = '#999999';
        mixCtx.font = 'bold 24px "Segoe UI", sans-serif'; 
        mixCtx.textAlign = 'center';
        mixCtx.textBaseline = 'middle';
        mixCtx.fillText('Camera Off', 320, 180); 
    }
    requestAnimationFrame(processBackgroundMediaCompositor);
}

// Timeline Logging
window.logActionDirectlyToTimeline = function(type, extraData = {}) { 
    if (window.isRecording) window.jsonDrawingTimelineLog.push({ tick: Date.now() - window.recordStartTime, type: type, ...extraData }); 
}

function trackSlideChangeInLog(idx) { window.logActionDirectlyToTimeline('slide-switch', { index: idx }); }

const originalPageShifter = window.jumpToSlideIndex;
window.jumpToSlideIndex = function(index) { 
    originalPageShifter(index); 
    if (window.isRecording) trackSlideChangeInLog(index); 
};

// Recording Logic
liveBadge.addEventListener('click', async () => {
    // 1. DYNAMIC PERMISSION CHECK: Ensure hardware is ready
    if (!isMicrophonePermissionGranted) {
        const granted = await requestHardwarePermissions();
        if (!granted) {
            alert("Microphone permission is required for audio recording.");
            return;
        }
    }

    if (window.isRecording) {
        window.saveCurrentSlideState();
        window.isRecording = false; 
        clearInterval(systemClockTimer); 
        masterAudioVideoRecorder.stop();
        return;
    }
    
    window.saveCurrentSlideState(); 
    window.isRecording = true; window.recordStartTime = Date.now(); window.jsonDrawingTimelineLog = []; compiledRecordingChunks = [];
    trackSlideChangeInLog(window.activeSlideIndex); processBackgroundMediaCompositor();

    const dest = mixCanvas.captureStream(12); 
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)(); 
    const destAudio = audioCtx.createMediaStreamDestination();

    if (isMicrophonePermissionGranted && localHardwareAVStream?.getAudioTracks().length) {
        audioCtx.createMediaStreamSource(localHardwareAVStream).connect(destAudio);
    } else {
        const completeSilenceNode = audioCtx.createGain(); completeSilenceNode.gain.value = 0; completeSilenceNode.connect(destAudio);
    }
    dest.addTrack(destAudio.stream.getAudioTracks()[0]);

    masterAudioVideoRecorder = new MediaRecorder(dest, { 
        mimeType: 'video/webm; codecs=vp8,opus',
        videoBitsPerSecond: 350000 
    });
    
    masterAudioVideoRecorder.ondataavailable = e => { if (e.data.size) compiledRecordingChunks.push(e.data); };
    
    masterAudioVideoRecorder.onstop = async () => {
        liveBadge.textContent = "⚙️ COMPRESSING...";
        liveBadge.style.background = "#555";

        const videoBlob = new Blob(compiledRecordingChunks, { type: 'video/webm' }); 
        const zip = new JSZip();
        zip.file("video.webm", videoBlob);
        
        const compressedSlidesArray = window.globalSlidesDeck.map((slide, sIdx) => {
            let isolatedSourceUrl = null; let isolatedThumbnailUrl = null;
            if (slide.sourceUrl && slide.sourceUrl.includes(',')) {
                const assetPath = `assets/bg_slide_${sIdx}.jpg`;
                zip.file(assetPath, slide.sourceUrl.split(',')[1], { base64: true });
                isolatedSourceUrl = assetPath;
            } else { isolatedSourceUrl = slide.sourceUrl; }
            if (slide.thumbnail && slide.thumbnail.includes(',')) {
                const thumbPath = `assets/thumb_slide_${sIdx}.webp`;
                zip.file(thumbPath, slide.thumbnail.split(',')[1], { base64: true });
                isolatedThumbnailUrl = thumbPath;
            } else { isolatedThumbnailUrl = slide.thumbnail; }
            return { id: slide.id, name: slide.name, type: slide.type, sourceUrl: isolatedSourceUrl, thumbnail: isolatedThumbnailUrl, annotation: slide.annotation };
        });

        const dataJsonPayload = { version: "Shiv Board Pro V5", timestamp: Date.now(), slides: compressedSlidesArray, timeline: window.jsonDrawingTimelineLog };
        zip.file("data.json", JSON.stringify(dataJsonPayload));
        
        const compressedArchiveBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 1 } });

        const downloadAnchor = document.createElement('a');
        downloadAnchor.href = URL.createObjectURL(compressedArchiveBlob);
        downloadAnchor.download = `ShivLecture_${Date.now()}.board`;
        document.body.appendChild(downloadAnchor); downloadAnchor.click(); document.body.removeChild(downloadAnchor);
        setTimeout(() => URL.revokeObjectURL(downloadAnchor.href), 30000);

        liveBadge.textContent = "🔴 LIVE"; liveBadge.style.background = ""; liveBadge.classList.remove('recording'); 
    };
    
    masterAudioVideoRecorder.start(); liveBadge.textContent = "🔴 RECORDING"; liveBadge.classList.add('recording');
    elapsedRecordingSeconds = 0;
    systemClockTimer = setInterval(() => {
        elapsedRecordingSeconds++;
        const pad = v => String(v).padStart(2, '0');
        document.getElementById('topTimer').textContent = `${pad(Math.floor(elapsedRecordingSeconds/3600))}:${pad(Math.floor((elapsedRecordingSeconds%3600)/60))}:${pad(elapsedRecordingSeconds%60)}`;
    }, 1000);
});

document.getElementById('btnEndClass').addEventListener('click', () => { if (window.isRecording) liveBadge.click(); });

function triggerToolbarToolViaShortcut(toolName) {
    const targetBtn = document.querySelector(`.tb-btn[data-tool="${toolName}"]`);
    if (targetBtn) targetBtn.click();
}

// Orientation and Dismiss Logic
document.getElementById('btnDismissOrientation')?.addEventListener('click', () => {
    if (orientOverlay) {
        orientOverlay.classList.add('hidden');
    }
});

// Shortcut Key Management
window.addEventListener('keydown', (e) => {
    if (e.key === 'Alt') { e.preventDefault(); document.getElementById('shortcutHudOverlay').style.display = 'flex'; }
    if (e.ctrlKey) {
        const key = e.key.toLowerCase();
        if (key === 'z') { e.preventDefault(); window.performUndo(); return; }
        if (key === 'y') { e.preventDefault(); window.performRedo(); return; }
        if (key >= '1' && key <= '6') {
            e.preventDefault();
            const slotIndex = parseInt(key, 10) - 1;
            const dots = document.querySelectorAll('#colorPalette .color-dot:not(.custom-color-picker)');
            if (dots[slotIndex]) dots[slotIndex].click();
        }
        switch (key) {
            case 'p': e.preventDefault(); triggerToolbarToolViaShortcut('pen'); break;
            case 'h': e.preventDefault(); triggerToolbarToolViaShortcut('highlight'); break;
            case 'e': e.preventDefault(); triggerToolbarToolViaShortcut('eraser'); break;
            case 't': e.preventDefault(); triggerToolbarToolViaShortcut('text'); break;
            case 'l':
                e.preventDefault();
                document.querySelectorAll('.tb-btn').forEach(b => b.classList.remove('active'));
                document.getElementById('btnShapesTrigger').classList.add('active');
                window.activeTool = 'shape'; window.activeShapeType = 'line';
                window.canvas.isDrawingMode = false; window.canvas.selection = false;
                window.canvas.forEachObject(o => o.set('selectable', false));
                window.updateBrush();
                break;
            case 'o': e.preventDefault(); document.getElementById('btnShapesTrigger').click(); break;
        }
    }
});
window.addEventListener('keyup', (e) => { if (e.key === 'Alt') { document.getElementById('shortcutHudOverlay').style.display = 'none'; } });