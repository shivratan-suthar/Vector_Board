/**
 * PLAYER1.JS - Canvas & UI Layout Engine
 * Handles scaling, slide background loading, UI toggles, PIP dragging,
 * YouTube-style single-tap visibility, and landscape fullscreen locking.
 */

window.globalSlidesDeck = [];
window.activeSlideIndex = 0;
window.isPlayingArchive = false; 
window.archivedTimeline = [];
window.areAnnotationsVisible = true;
window.isSlideModeActive = false;
window.currentPlaybackRate = 1.0; 

window.parentContainer = document.getElementById('canvasContainer');
window.canvas = new fabric.Canvas('fabricCanvas', { 
    width: 1920, 
    height: 1080, 
    isDrawingMode: false, 
    selection: false, 
    backgroundColor: '#1c1c1c',
    enableRetinaScaling: false // Keeps 1:1 virtual coordinate mapping across mobile and desktop
});
window.camVideoFeed = document.getElementById('webcamVideoFeed');
window.playPauseBtn = document.getElementById('btnModernPlayPause');
window.seekbar = document.getElementById('playerMasterTimelineSliderScrubber');
window.settingsCard = document.getElementById('modernSettingsCardPopup');
const dragBox = document.getElementById('webcamContainerWrapperBox');

const workspaceEl = document.querySelector('.central-workspace');
const playbackPanelUI = document.getElementById('studioPlaybackPlayerToolbarUI');
let controlsHideTimer = null;

// --- CANVAS DIMENSIONS & RESPONSIVE SCALING ---
window.syncCanvasDimensionsToWrapper = () => {
    const targetRatio = 16 / 9; 
    const containerW = window.parentContainer.clientWidth || window.innerWidth;
    const containerH = window.parentContainer.clientHeight || (containerW / targetRatio);

    const containerRatio = containerW / containerH;
    let newWidth = (containerRatio > targetRatio) ? containerH * targetRatio : containerW;
    let newHeight = (containerRatio > targetRatio) ? containerH : containerW / targetRatio;

    // Fill 100% of wrapper on mobile screens, keep 96% padding on desktop
    const isMobile = window.innerWidth <= 800;
    const scaleFactor = isMobile ? 1.0 : 0.96;

    const renderW = Math.max(1, newWidth * scaleFactor);
    const renderH = Math.max(1, newHeight * scaleFactor);

    window.canvas.setWidth(renderW);
    window.canvas.setHeight(renderH);
    window.canvas.setZoom(renderW / 1920);
    window.canvas.calcOffset(); 
    
    if (window.globalSlidesDeck[window.activeSlideIndex]) {
        window.applySlideBackground(window.globalSlidesDeck[window.activeSlideIndex]);
    }
    window.canvas.renderAll(); 
};
window.addEventListener('resize', window.syncCanvasDimensionsToWrapper);
window.addEventListener('orientationchange', () => {
    setTimeout(window.syncCanvasDimensionsToWrapper, 200);
});

// --- YOUTUBE-STYLE 1-TAP CONTROLS & AUTO-HIDE ---
function showControlsTemporarily() {
    if (!playbackPanelUI) return;
    playbackPanelUI.classList.add('force-panel-visible');
    
    clearTimeout(controlsHideTimer);
    controlsHideTimer = setTimeout(() => {
        // Auto-hide only when in fullscreen
        if (document.fullscreenElement || document.webkitFullscreenElement) {
            playbackPanelUI.classList.remove('force-panel-visible');
        }
    }, 3000);
}

workspaceEl.addEventListener('pointerup', (e) => {
    // Avoid toggling when clicking controls, PIP camera box, or settings card
    if (e.target.closest('#studioPlaybackPlayerToolbarUI') || 
        e.target.closest('#webcamContainerWrapperBox') || 
        e.target.closest('#modernSettingsCardPopup')) {
        return;
    }

    if (!playbackPanelUI) return;

    const isVisible = playbackPanelUI.classList.contains('force-panel-visible');
    if (isVisible) {
        clearTimeout(controlsHideTimer);
        playbackPanelUI.classList.remove('force-panel-visible');
    } else {
        showControlsTemporarily();
    }
});

// --- PIP CAMERA BOX POINTER DRAG ---
let isDragging = false; 
let startX, startY, initialLeft, initialTop;

dragBox.addEventListener('pointerdown', (e) => {
    if (window.isSlideModeActive) return;
    isDragging = true; 
    startX = e.clientX; 
    startY = e.clientY;
    initialLeft = dragBox.offsetLeft; 
    initialTop = dragBox.offsetTop;
    dragBox.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
});

window.addEventListener('pointermove', (e) => {
    if (!isDragging || window.isSlideModeActive) return;
    let targetLeft = initialLeft + (e.clientX - startX); 
    let targetTop = initialTop + (e.clientY - startY);
    
    const containerW = window.parentContainer.clientWidth; 
    const containerH = window.parentContainer.clientHeight;
    const elementW = dragBox.offsetWidth; 
    const elementH = dragBox.offsetHeight;

    if (targetLeft < 0) targetLeft = 0;
    if (targetLeft > containerW - elementW) targetLeft = containerW - elementW;
    if (targetTop < 0) targetTop = 0;
    if (targetTop > containerH - elementH) targetTop = containerH - elementH;

    dragBox.style.left = targetLeft + 'px'; 
    dragBox.style.top = targetTop + 'px'; 
    dragBox.style.right = 'auto';
});

window.addEventListener('pointerup', (e) => { 
    if (isDragging) {
        try { dragBox.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    isDragging = false; 
});

window.addEventListener('pointercancel', (e) => {
    if (isDragging) {
        try { dragBox.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    isDragging = false; 
});

// --- SLIDE SORTER UI & BACKGROUNDS ---
window.renderFlatSlideSorterUI = function() {
    const container = document.getElementById('fileRegistryContainer'); 
    container.innerHTML = '';
    window.globalSlidesDeck.forEach((slide, index) => {
        const card = document.createElement('div');
        card.className = `file-card ${index === window.activeSlideIndex ? 'playing-active' : ''}`;
        card.setAttribute('onclick', `window.jumpToSlideIndex(${index}, event)`);
        const playCircleOverlayIcon = window.isSlideModeActive ? '<div class="play-overlay">▶</div>' : '';
        
        let previewSrc = slide.thumbnail;
        if (!window.areAnnotationsVisible) { 
            previewSrc = slide.sourceUrl || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><rect width="100%" height="100%" fill="%231c1c1c"/></svg>'; 
        }

        card.innerHTML = `<div class="thumb-box">${playCircleOverlayIcon}<img src="${previewSrc}"></div>
                          <div class="card-info"><div class="slide-num-badge">${index + 1}</div><span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:70%; font-weight:500;">${slide.name}</span></div>`;
        container.appendChild(card);
    });
    document.getElementById('lblStepperIndexTextIndicator').textContent = `${window.activeSlideIndex + 1} / ${window.globalSlidesDeck.length}`;
};

window.applySlideBackground = function(slide) {
    if (!slide) return;
    if (slide.sourceUrl) {
        fabric.Image.fromURL(slide.sourceUrl, img => { 
            img.scaleToWidth(1920);
            window.canvas.setBackgroundImage(img, window.canvas.renderAll.bind(window.canvas)); 
        });
    } else { 
        window.canvas.setBackgroundImage(null, window.canvas.renderAll.bind(window.canvas)); 
    }
};

// --- SETTINGS POPUP MENU ---
document.getElementById('btnModernSettingsTrigger').addEventListener('click', e => { 
    e.stopPropagation(); 
    window.settingsCard.classList.toggle('open'); 
    document.getElementById('settingsPopupMainLayer').classList.remove('hidden'); 
    document.getElementById('settingsPopupSpeedLayer').classList.add('hidden');
});

window.addEventListener('click', () => { 
    window.settingsCard.classList.remove('open'); 
});

document.getElementById('btnTriggerSpeedSubmenu').addEventListener('click', (e) => {
    e.stopPropagation(); 
    document.getElementById('settingsPopupMainLayer').classList.add('hidden'); 
    document.getElementById('settingsPopupSpeedLayer').classList.remove('hidden');
});

document.getElementById('btnBackToMainSettingsMenu').addEventListener('click', () => {
    document.getElementById('settingsPopupMainLayer').classList.remove('hidden'); 
    document.getElementById('settingsPopupSpeedLayer').classList.add('hidden');
});

// --- SLIDE MODE TOGGLE ---
window.toggleSlideMode = function(forceState) {
    window.isSlideModeActive = (forceState !== undefined) ? forceState : !window.isSlideModeActive;
    const sidebar = document.getElementById('appWorkspaceSidebarColumnPanel');
    const sideBackBtn = document.getElementById('btnExitSlideModeArrow');
    
    if (window.isSlideModeActive) {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
            if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }

        window.camVideoFeed.pause(); 
        window.playPauseBtn.textContent = "▶"; 
        document.getElementById('pillSlideModeOff').classList.remove('active'); 
        document.getElementById('pillSlideModeOn').classList.add('active');
        sidebar.classList.remove('slide-mode-hidden'); 
        document.body.classList.add('sidebar-open');
        document.getElementById('studioPlaybackPlayerToolbarUI').classList.add('hidden'); 
        window.settingsCard.classList.remove('open');
        sideBackBtn.classList.remove('hidden'); 
        dragBox.style.display = 'none';
        window.jumpToSlideIndex(window.activeSlideIndex);
    } else {
        document.getElementById('pillSlideModeOn').classList.remove('active'); 
        document.getElementById('pillSlideModeOff').classList.add('active');
        sidebar.classList.add('slide-mode-hidden'); 
        document.body.classList.remove('sidebar-open');
        document.getElementById('studioPlaybackPlayerToolbarUI').classList.remove('hidden'); 
        sideBackBtn.classList.add('hidden'); 
        dragBox.style.display = 'flex';
        window.reconstructCanvasStateToTimestamp(window.camVideoFeed.currentTime * 1000);
    }
    window.renderFlatSlideSorterUI(); 
    setTimeout(window.syncCanvasDimensionsToWrapper, 320);
};

document.getElementById('rowToggleSlideMode').addEventListener('click', () => window.toggleSlideMode());
document.getElementById('btnExitSlideModeArrow').addEventListener('click', (e) => { 
    e.stopPropagation(); 
    window.toggleSlideMode(false); 
});

document.getElementById('btnToggleAnnotationsVectorVisibility').addEventListener('click', () => {
    window.areAnnotationsVisible = !window.areAnnotationsVisible;
    if (window.areAnnotationsVisible) { 
        document.getElementById('pillVectorsOff').classList.remove('active'); 
        document.getElementById('pillVectorsOn').classList.add('active'); 
    } else { 
        document.getElementById('pillVectorsOn').classList.remove('active'); 
        document.getElementById('pillVectorsOff').classList.add('active'); 
    }
    
    if (window.isSlideModeActive) {
        window.jumpToSlideIndex(window.activeSlideIndex);
    } else { 
        window.canvas.forEachObject(obj => { 
            obj.visible = (obj.slideIndex === window.activeSlideIndex && window.areAnnotationsVisible); 
        }); 
        window.canvas.renderAll(); 
    }
    window.renderFlatSlideSorterUI(); 
});

// --- YOUTUBE-STYLE FULLSCREEN & ORIENTATION LOCK ---
document.getElementById('btnModernFullscreenToggle').addEventListener('click', async (e) => {
    e.stopPropagation();

    const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);

    if (!isFullscreen) { 
        try {
            if (workspaceEl.requestFullscreen) {
                await workspaceEl.requestFullscreen();
            } else if (workspaceEl.webkitRequestFullscreen) {
                await workspaceEl.webkitRequestFullscreen();
            }

            // Lock screen orientation to landscape on mobile
            if (screen.orientation && screen.orientation.lock) {
                await screen.orientation.lock('landscape').catch(() => {});
            }
        } catch (err) {
            console.warn("Fullscreen/Orientation lock unavailable:", err);
        }

        showControlsTemporarily();
        setTimeout(window.syncCanvasDimensionsToWrapper, 150);
    } else { 
        try {
            if (screen.orientation && screen.orientation.unlock) {
                screen.orientation.unlock();
            }
            if (document.exitFullscreen) {
                await document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                await document.webkitExitFullscreen();
            }
        } catch (_) {}
    }
});

function handleFullscreenTransition() {
    const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (!isFullscreen) {
        clearTimeout(controlsHideTimer);
        if (playbackPanelUI) playbackPanelUI.classList.remove('force-panel-visible');
        if (screen.orientation && screen.orientation.unlock) {
            try { screen.orientation.unlock(); } catch (_) {}
        }
    } else {
        showControlsTemporarily();
    }
    setTimeout(window.syncCanvasDimensionsToWrapper, 150);
}

document.addEventListener('fullscreenchange', handleFullscreenTransition);
document.addEventListener('webkitfullscreenchange', handleFullscreenTransition);

document.getElementById('btnStepperPrevPage').addEventListener('click', () => { 
    if (window.activeSlideIndex > 0) window.jumpToSlideIndex(window.activeSlideIndex - 1); 
});
document.getElementById('btnStepperNextPage').addEventListener('click', () => { 
    if (window.activeSlideIndex < window.globalSlidesDeck.length - 1) window.jumpToSlideIndex(window.activeSlideIndex + 1); 
});

// --- VOLUME & MUTE LINKAGE LOGIC ---
const muteBtn = document.getElementById('btnModernMuteToggle');
const volSlider = document.getElementById('playerVolumeSlider');

if (muteBtn) {
    muteBtn.addEventListener('click', () => {
        window.camVideoFeed.muted = !window.camVideoFeed.muted;
        muteBtn.textContent = window.camVideoFeed.muted || window.camVideoFeed.volume === 0 ? "🔇" : (window.camVideoFeed.volume > 0.5 ? "🔊" : "🔉");
        if (volSlider) volSlider.value = window.camVideoFeed.muted ? 0 : (window.camVideoFeed.volume || 1);
    });
}

if (volSlider) {
    volSlider.addEventListener('input', (e) => {
        const vol = parseFloat(e.target.value);
        window.camVideoFeed.volume = vol;
        if (vol > 0) {
            window.camVideoFeed.muted = false;
            if (muteBtn) muteBtn.textContent = vol > 0.5 ? "🔊" : "🔉";
        } else {
            window.camVideoFeed.muted = true;
            if (muteBtn) muteBtn.textContent = "🔇";
        }
    });
}

// --- PDF EXPORT ENGINE (OFF-SCREEN) ---
document.getElementById('btnDownloadPdf').addEventListener('click', async function() {
    if (!window.globalSlidesDeck || window.globalSlidesDeck.length === 0) return;
    
    const btn = this;
    const originalText = btn.textContent;
    btn.textContent = "⏳";
    btn.disabled = true;

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('landscape', 'px', [1920, 1080]);
        
        const tempCanvasEl = document.createElement('canvas');
        tempCanvasEl.width = 1920;
        tempCanvasEl.height = 1080;
        const exportCanvas = new fabric.Canvas(tempCanvasEl, { width: 1920, height: 1080, backgroundColor: '#1c1c1c', enableRetinaScaling: false });

        for (let i = 0; i < window.globalSlidesDeck.length; i++) {
            const slide = window.globalSlidesDeck[i];
            exportCanvas.clear();

            if (slide.sourceUrl) {
                await new Promise((resolve) => {
                    fabric.Image.fromURL(slide.sourceUrl, (img) => {
                        img.scaleToWidth(1920);
                        exportCanvas.setBackgroundImage(img, exportCanvas.renderAll.bind(exportCanvas));
                        resolve();
                    }, { crossOrigin: 'anonymous' }); 
                });
            }

            if (window.areAnnotationsVisible && slide.annotation) {
                await new Promise((resolve) => {
                    exportCanvas.loadFromJSON(slide.annotation, () => {
                        exportCanvas.forEachObject(obj => { obj.visible = true; }); 
                        exportCanvas.renderAll();
                        resolve();
                    });
                });
            }

            const imgData = exportCanvas.toDataURL({ format: 'jpeg', quality: 0.8 });
            if (i > 0) pdf.addPage([1920, 1080], 'landscape');
            pdf.addImage(imgData, 'JPEG', 0, 0, 1920, 1080);
        }

        pdf.save('Session_Archive.pdf');
        exportCanvas.dispose();

    } catch (err) {
        console.error("PDF Generation Failed:", err);
        alert("Failed to generate PDF. Check console for details.");
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
});

// --- RETURN TO HOME HUB CONTROLLER ---
function exitPlayerToHomeHub() {
    window.isPlayingArchive = false;
    
    if (window.camVideoFeed) {
        window.camVideoFeed.pause();
        window.camVideoFeed.src = "";
    }
    
    if (typeof playbackRenderAnimationFrameLoopId !== 'undefined') {
        cancelAnimationFrame(playbackRenderAnimationFrameLoopId);
    }
    
    if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (screen.orientation && screen.orientation.unlock) {
            try { screen.orientation.unlock(); } catch (_) {}
        }
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
    
    if (window.canvas) {
        window.canvas.clear();
        window.canvas.setBackgroundImage(null, window.canvas.renderAll.bind(window.canvas));
    }
    
    if (window.activeBlobUrls) {
        window.activeBlobUrls.forEach(url => URL.revokeObjectURL(url));
        window.activeBlobUrls = [];
    }
    
    if (window.playPauseBtn) window.playPauseBtn.textContent = "▶";
    const cursorEl = document.getElementById('playbackCursor');
    if (cursorEl) cursorEl.style.display = 'none';
    
    const homeView = document.getElementById('homeViewContainer');
    if (homeView) homeView.classList.remove('hidden');
}

const exitToolbarBtn = document.getElementById('btnPlayerExitToMenu');
const exitHeaderBtn = document.getElementById('btnBackToHomeMenu');

if (exitToolbarBtn) exitToolbarBtn.addEventListener('click', exitPlayerToHomeHub);
if (exitHeaderBtn) exitHeaderBtn.addEventListener('click', exitPlayerToHomeHub);