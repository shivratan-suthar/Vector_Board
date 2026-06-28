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
window.canvas = new fabric.Canvas('fabricCanvas', { width: 1920, height: 1080, isDrawingMode: false, selection: false, backgroundColor: '#1c1c1c' });
window.camVideoFeed = document.getElementById('webcamVideoFeed');
window.playPauseBtn = document.getElementById('btnModernPlayPause');
window.seekbar = document.getElementById('playerMasterTimelineSliderScrubber');
window.settingsCard = document.getElementById('modernSettingsCardPopup');
const dragBox = document.getElementById('webcamContainerWrapperBox');

window.syncCanvasDimensionsToWrapper = () => {
    const targetRatio = 16 / 9; 
    const containerRatio = window.parentContainer.clientWidth / window.parentContainer.clientHeight;
    let newWidth = (containerRatio > targetRatio) ? window.parentContainer.clientHeight * targetRatio : window.parentContainer.clientWidth;
    let newHeight = (containerRatio > targetRatio) ? window.parentContainer.clientHeight : window.parentContainer.clientWidth / targetRatio;

    const renderW = newWidth * 0.96;
    const renderH = newHeight * 0.96;

    window.canvas.setWidth(renderW);
    window.canvas.setHeight(renderH);
    window.canvas.setZoom(renderW / 1920); // MASTER 1920 VIRTUAL LOCK
    window.canvas.calcOffset(); 
    
    if (window.globalSlidesDeck[window.activeSlideIndex]) {
        window.applySlideBackground(window.globalSlidesDeck[window.activeSlideIndex]);
    }
    window.canvas.renderAll(); 
};
window.addEventListener('resize', window.syncCanvasDimensionsToWrapper);

let isDragging = false; let startX, startY, initialLeft, initialTop;
dragBox.addEventListener('mousedown', (e) => {
    if (window.isSlideModeActive) return;
    isDragging = true; startX = e.clientX; startY = e.clientY;
    initialLeft = dragBox.offsetLeft; initialTop = dragBox.offsetTop;
    e.preventDefault();
});
window.addEventListener('mousemove', (e) => {
    if (!isDragging || window.isSlideModeActive) return;
    let targetLeft = initialLeft + (e.clientX - startX); 
    let targetTop = initialTop + (e.clientY - startY);
    const containerW = window.parentContainer.clientWidth; const containerH = window.parentContainer.clientHeight;
    const elementW = dragBox.offsetWidth; const elementH = dragBox.offsetHeight;

    if (targetLeft < -(elementW / 2)) targetLeft = -(elementW / 2);
    if (targetLeft > containerW - (elementW / 2)) targetLeft = containerW - (elementW / 2);
    if (targetTop < -(elementH / 2)) targetTop = -(elementH / 2);
    if (targetTop > containerH - (elementH / 2)) targetTop = containerH - (elementH / 2);

    dragBox.style.left = targetLeft + 'px'; dragBox.style.top = targetTop + 'px'; dragBox.style.right = 'auto';
});
window.addEventListener('mouseup', () => { isDragging = false; });

window.renderFlatSlideSorterUI = function() {
    const container = document.getElementById('fileRegistryContainer'); container.innerHTML = '';
    window.globalSlidesDeck.forEach((slide, index) => {
        const card = document.createElement('div');
        card.className = `file-card ${index === window.activeSlideIndex ? 'playing-active' : ''}`;
        card.setAttribute('onclick', `window.jumpToSlideIndex(${index}, event)`);
        const playCircleOverlayIcon = window.isSlideModeActive ? '<div class="play-overlay">▶</div>' : '';
        
        let previewSrc = slide.thumbnail;
        if (!window.areAnnotationsVisible) { previewSrc = slide.sourceUrl || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><rect width="100%" height="100%" fill="%231c1c1c"/></svg>'; }

        card.innerHTML = `<div class="thumb-box">${playCircleOverlayIcon}<img src="${previewSrc}"></div>
                          <div class="card-info"><div class="slide-num-badge">${index + 1}</div><span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:70%; font-weight:500;">${slide.name}</span></div>`;
        container.appendChild(card);
    });
    document.getElementById('lblStepperIndexTextIndicator').textContent = `${window.activeSlideIndex + 1} / ${window.globalSlidesDeck.length}`;
}

window.applySlideBackground = function(slide) {
    if (!slide) return;
    if (slide.sourceUrl) {
        fabric.Image.fromURL(slide.sourceUrl, img => { 
            img.scaleToWidth(1920); // MASTER 1920 VIRTUAL LOCK
            window.canvas.setBackgroundImage(img, window.canvas.renderAll.bind(window.canvas)); 
        });
    } else { 
        window.canvas.setBackgroundImage(null, window.canvas.renderAll.bind(window.canvas)); 
    }
}

document.getElementById('btnModernSettingsTrigger').addEventListener('click', e => { 
    e.stopPropagation(); window.settingsCard.classList.toggle('open'); 
    document.getElementById('settingsPopupMainLayer').classList.remove('hidden'); document.getElementById('settingsPopupSpeedLayer').classList.add('hidden');
});
window.addEventListener('click', () => { window.settingsCard.classList.remove('open'); });
document.getElementById('btnTriggerSpeedSubmenu').addEventListener('click', (e) => {
    e.stopPropagation(); document.getElementById('settingsPopupMainLayer').classList.add('hidden'); document.getElementById('settingsPopupSpeedLayer').classList.remove('hidden');
});
document.getElementById('btnBackToMainSettingsMenu').addEventListener('click', () => {
    document.getElementById('settingsPopupMainLayer').classList.remove('hidden'); document.getElementById('settingsPopupSpeedLayer').classList.add('hidden');
});

window.toggleSlideMode = function(forceState) {
    window.isSlideModeActive = (forceState !== undefined) ? forceState : !window.isSlideModeActive;
    const sidebar = document.getElementById('appWorkspaceSidebarColumnPanel');
    const sideBackBtn = document.getElementById('btnExitSlideModeArrow');
    
    if (window.isSlideModeActive) {
        // --- NEW: Exit fullscreen if it is currently active ---
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(err => console.error("Could not exit fullscreen:", err));
        }

        window.camVideoFeed.pause(); window.playPauseBtn.textContent = "▶"; 
        document.getElementById('pillSlideModeOff').classList.remove('active'); document.getElementById('pillSlideModeOn').classList.add('active');
        sidebar.classList.remove('slide-mode-hidden'); document.body.classList.add('sidebar-open');
        document.getElementById('studioPlaybackPlayerToolbarUI').classList.add('hidden'); window.settingsCard.classList.remove('open');
        sideBackBtn.classList.remove('hidden'); dragBox.style.display = 'none';
        window.jumpToSlideIndex(window.activeSlideIndex);
    } else {
        document.getElementById('pillSlideModeOn').classList.remove('active'); document.getElementById('pillSlideModeOff').classList.add('active');
        sidebar.classList.add('slide-mode-hidden'); document.body.classList.remove('sidebar-open');
        document.getElementById('studioPlaybackPlayerToolbarUI').classList.remove('hidden'); sideBackBtn.classList.add('hidden'); dragBox.style.display = 'flex';
        window.reconstructCanvasStateToTimestamp(window.camVideoFeed.currentTime * 1000);
    }
    window.renderFlatSlideSorterUI(); setTimeout(window.syncCanvasDimensionsToWrapper, 320);
}
document.getElementById('rowToggleSlideMode').addEventListener('click', () => window.toggleSlideMode());
document.getElementById('btnExitSlideModeArrow').addEventListener('click', (e) => { e.stopPropagation(); window.toggleSlideMode(false); });

document.getElementById('btnToggleAnnotationsVectorVisibility').addEventListener('click', () => {
    window.areAnnotationsVisible = !window.areAnnotationsVisible;
    if (window.areAnnotationsVisible) { document.getElementById('pillVectorsOff').classList.remove('active'); document.getElementById('pillVectorsOn').classList.add('active'); } 
    else { document.getElementById('pillVectorsOn').classList.remove('active'); document.getElementById('pillVectorsOff').classList.add('active'); }
    
    if (window.isSlideModeActive) window.jumpToSlideIndex(window.activeSlideIndex);
    else { window.canvas.forEachObject(obj => { obj.visible = (obj.slideIndex === window.activeSlideIndex && window.areAnnotationsVisible); }); window.canvas.renderAll(); }
    window.renderFlatSlideSorterUI(); 
});

// Fullscreen Workspace Target
document.getElementById('btnModernFullscreenToggle').addEventListener('click', () => {
    const workspace = document.querySelector('.central-workspace');
    if (!document.fullscreenElement) { 
        workspace.requestFullscreen().then(() => { setTimeout(window.syncCanvasDimensionsToWrapper, 100); }); 
    } 
    else { document.exitFullscreen(); }
});
document.addEventListener('fullscreenchange', () => { setTimeout(window.syncCanvasDimensionsToWrapper, 150); });

document.getElementById('btnStepperPrevPage').addEventListener('click', () => { if (window.activeSlideIndex > 0) window.jumpToSlideIndex(window.activeSlideIndex - 1); });
document.getElementById('btnStepperNextPage').addEventListener('click', () => { if (window.activeSlideIndex < window.globalSlidesDeck.length - 1) window.jumpToSlideIndex(window.activeSlideIndex + 1); });

// Volume & Mute Linkage Logic
const muteBtn = document.getElementById('btnModernMuteToggle');
const volSlider = document.getElementById('playerVolumeSlider');

if (muteBtn) {
    muteBtn.addEventListener('click', (e) => {
        window.camVideoFeed.muted = !window.camVideoFeed.muted;
        muteBtn.textContent = window.camVideoFeed.muted || window.camVideoFeed.volume === 0 ? "🔇" : (window.camVideoFeed.volume > 0.5 ? "🔊" : "🔉");
        if(volSlider) volSlider.value = window.camVideoFeed.muted ? 0 : (window.camVideoFeed.volume || 1);
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
    btn.textContent = "⏳"; // Simple loading state
    btn.disabled = true;

    try {
        const { jsPDF } = window.jspdf;
        // Create 16:9 Landscape PDF (1920x1080)
        const pdf = new jsPDF('landscape', 'px', [1920, 1080]);
        
        // Create an isolated ghost canvas in memory
        const tempCanvasEl = document.createElement('canvas');
        tempCanvasEl.width = 1920;
        tempCanvasEl.height = 1080;
        const exportCanvas = new fabric.Canvas(tempCanvasEl, { width: 1920, height: 1080, backgroundColor: '#1c1c1c' });

        for (let i = 0; i < window.globalSlidesDeck.length; i++) {
            const slide = window.globalSlidesDeck[i];
            exportCanvas.clear();

            // 1. Load Background Image
            if (slide.sourceUrl) {
                await new Promise((resolve) => {
                    fabric.Image.fromURL(slide.sourceUrl, (img) => {
                        img.scaleToWidth(1920);
                        exportCanvas.setBackgroundImage(img, exportCanvas.renderAll.bind(exportCanvas));
                        resolve();
                    }, { crossOrigin: 'anonymous' }); 
                });
            }

            // 2. Load Vector Annotations (Only if toggled ON)
            if (window.areAnnotationsVisible && slide.annotation) {
                await new Promise((resolve) => {
                    exportCanvas.loadFromJSON(slide.annotation, () => {
                        // Ensure annotations respect the global visibility state
                        exportCanvas.forEachObject(obj => { obj.visible = true; }); 
                        exportCanvas.renderAll();
                        resolve();
                    });
                });
            }

            // 3. Snapshot and Append to PDF
            const imgData = exportCanvas.toDataURL({ format: 'jpeg', quality: 0.8 });
            if (i > 0) pdf.addPage([1920, 1080], 'landscape');
            pdf.addImage(imgData, 'JPEG', 0, 0, 1920, 1080);
        }

        // Trigger Download
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
    
    // 1. Stop video playback and disconnect source
    if (window.camVideoFeed) {
        window.camVideoFeed.pause();
        window.camVideoFeed.src = "";
    }
    
    // 2. Halt the active runtime animation loop
    if (typeof playbackRenderAnimationFrameLoopId !== 'undefined') {
        cancelAnimationFrame(playbackRenderAnimationFrameLoopId);
    }
    
    // 3. Exit Fullscreen mode if active
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }
    
    // 4. Wipe canvas clear
    if (window.canvas) {
        window.canvas.clear();
        window.canvas.setBackgroundImage(null, window.canvas.renderAll.bind(window.canvas));
    }
    
    // 5. Flush unzipped memory Blobs to prevent RAM leaks
    if (window.activeBlobUrls) {
        window.activeBlobUrls.forEach(url => URL.revokeObjectURL(url));
        window.activeBlobUrls = [];
    }
    
    // 6. Hide tracking cursor and reset UI text
    if (window.playPauseBtn) window.playPauseBtn.textContent = "▶";
    const cursorEl = document.getElementById('playbackCursor');
    if (cursorEl) cursorEl.style.display = 'none';
    
    // 7. Unhide the initial File Loader Hub
    const homeView = document.getElementById('homeViewContainer');
    if (homeView) homeView.classList.remove('hidden');
}

// Bind to both the toolbar arrow and the top header button
const exitToolbarBtn = document.getElementById('btnPlayerExitToMenu');
const exitHeaderBtn = document.getElementById('btnBackToHomeMenu');

if (exitToolbarBtn) exitToolbarBtn.addEventListener('click', exitPlayerToHomeHub);
if (exitHeaderBtn) exitHeaderBtn.addEventListener('click', exitPlayerToHomeHub);