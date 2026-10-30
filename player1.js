/**
 * PLAYER1.JS - Canvas & UI Layout Engine
 * Handles scaling, slide background loading, UI toggles, and PIP dragging.
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
    enableRetinaScaling: false
});
window.camVideoFeed = document.getElementById('webcamVideoFeed');
window.playPauseBtn = document.getElementById('btnModernPlayPause');
window.seekbar = document.getElementById('playerMasterTimelineSliderScrubber');
window.settingsCard = document.getElementById('modernSettingsCardPopup');
const dragBox = document.getElementById('webcamContainerWrapperBox');

window.syncCanvasDimensionsToWrapper = () => {
    const targetRatio = 16 / 9; 
    const containerW = window.parentContainer.clientWidth || window.innerWidth;
    const containerH = window.parentContainer.clientHeight || (containerW / targetRatio);

    const containerRatio = containerW / containerH;
    let newWidth = (containerRatio > targetRatio) ? containerH * targetRatio : containerW;
    let newHeight = (containerRatio > targetRatio) ? containerH : containerW / targetRatio;

    const renderW = Math.max(1, newWidth * 0.96);
    const renderH = Math.max(1, newHeight * 0.96);

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

// Pointer drag logic with container boundary clamping
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

// Double-click/double-tap to toggle video controls visibility
let lastTapTimestamp = 0;
const workspaceEl = document.querySelector('.central-workspace');
const playbackPanelUI = document.getElementById('studioPlaybackPlayerToolbarUI');

workspaceEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#studioPlaybackPlayerToolbarUI') || 
        e.target.closest('#webcamContainerWrapperBox') || 
        e.target.closest('#modernSettingsCardPopup')) {
        return;
    }

    const currentTime = Date.now();
    const timeDelta = currentTime - lastTapTimestamp;

    if (timeDelta < 300 && timeDelta > 0) {
        if (playbackPanelUI) {
            playbackPanelUI.classList.toggle('force-panel-visible');
        }
        lastTapTimestamp = 0;
    } else {
        lastTapTimestamp = currentTime;
    }
});

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

window.toggleSlideMode = function(forceState) {
    window.isSlideModeActive = (forceState !== undefined) ? forceState : !window.isSlideModeActive;
    const sidebar = document.getElementById('appWorkspaceSidebarColumnPanel');
    const sideBackBtn = document.getElementById('btnExitSlideModeArrow');
    
    if (window.isSlideModeActive) {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(err => console.error("Could not exit fullscreen:", err));
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

// Fullscreen Workspace Target with Landscape Lock
document.getElementById('btnModernFullscreenToggle').addEventListener('click', async () => {
    const workspace = document.querySelector('.central-workspace');
    if (!document.fullscreenElement) { 
        try {
            if (workspace.requestFullscreen) {
                await workspace.requestFullscreen();
            } else if (workspace.webkitRequestFullscreen) {
                await workspace.webkitRequestFullscreen();
            }

            if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('landscape').catch(() => {});
            }
        } catch (_) {}
        setTimeout(window.syncCanvasDimensionsToWrapper, 150);
    } else { 
        if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
        }
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }
    }
});

document.addEventListener('fullscreenchange', () => { 
    setTimeout(window.syncCanvasDimensionsToWrapper, 150); 
});
document.addEventListener('webkitfullscreenchange', () => { 
    setTimeout(window.syncCanvasDimensionsToWrapper, 150); 
});

document.getElementById('btnStepperPrevPage').addEventListener('click', () => { 
    if (window.activeSlideIndex > 0) window.jumpToSlideIndex(window.activeSlideIndex - 1); 
});
document.getElementById('btnStepperNextPage').addEventListener('click', () => { 
    if (window.activeSlideIndex < window.globalSlidesDeck.length - 1) window.jumpToSlideIndex(window.activeSlideIndex + 1); 
});

// Volume & Mute Linkage Logic
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

// PDF Export
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

// Return to Home Hub Controller
function exitPlayerToHomeHub() {
    window.isPlayingArchive = false;
    
    if (window.camVideoFeed) {
        window.camVideoFeed.pause();
        window.camVideoFeed.src = "";
    }
    
    if (typeof playbackRenderAnimationFrameLoopId !== 'undefined') {
        cancelAnimationFrame(playbackRenderAnimationFrameLoopId);
    }
    
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
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