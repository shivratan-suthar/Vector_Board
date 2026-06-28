/**
 * PLAYER2.JS - Timeline & Telemetry Engine
 * Handles JSZip payload extraction, JSON array re-rendering, SVG DOM Cursors
 * and YouTube-style playback speed shortcuts.
 */

let playbackRenderAnimationFrameLoopId = null; 
let playbackEventPointerIndex = 0;
let playbackActiveObject = null;
let playbackLastX = 0, playbackLastY = 0;
let shapeStartX = 0, shapeStartY = 0; 
let playbackDrawColor = '#ffffff', playbackDrawWidth = 8, playbackDrawTool = 'pen';
let playbackCurrentDrawingId = null; 
let strokeHomeSlideIndex = 0; 
let ytToastTimer = null;
window.baseAnnotationsDeck = [];
window.activeBlobUrls = []; 

let playbackActivePoints = [];
let playbackActivePathProps = null;
let pendingImageTransforms = {}; 

window.canvasAsyncEpoch = 0; 

function getSmoothPathFromPoints(points) {
    if (!points || points.length === 0) return 'M 0 0';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y} L ${points[0].x} ${points[0].y}`;
    if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    let pathStr = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
        let xc = (points[i].x + points[i + 1].x) / 2;
        let yc = (points[i].y + points[i + 1].y) / 2;
        pathStr += ` Q ${points[i].x} ${points[i].y}, ${xc} ${yc}`;
    }
    pathStr += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
    return pathStr;
}

const allowedSpeeds = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
window.changePlaybackSpeed = function(direction) {
    let currentIndex = allowedSpeeds.indexOf(window.currentPlaybackRate);
    if (currentIndex === -1) currentIndex = 3; 

    if (direction === 'up' && currentIndex < allowedSpeeds.length - 1) window.currentPlaybackRate = allowedSpeeds[currentIndex + 1];
    else if (direction === 'down' && currentIndex > 0) window.currentPlaybackRate = allowedSpeeds[currentIndex - 1];
    else if (direction !== 'exact') return; 

    window.camVideoFeed.playbackRate = window.currentPlaybackRate;
    document.getElementById('lblSpeedValueDisplay').textContent = `${window.currentPlaybackRate === 1 ? 'Normal' : window.currentPlaybackRate + 'x'} >`;
    
    document.querySelectorAll('.speed-selection-item').forEach(i => {
        i.classList.remove('selected'); i.querySelector('.speed-check-icon').textContent = "";
        if (parseFloat(i.dataset.val) === window.currentPlaybackRate) { i.classList.add('selected'); i.querySelector('.speed-check-icon').textContent = "✓ "; }
    });
};

document.querySelectorAll('.speed-selection-item').forEach(item => {
    item.addEventListener('click', () => { window.currentPlaybackRate = parseFloat(item.dataset.val); window.changePlaybackSpeed('exact'); document.getElementById('settingsPopupMainLayer').classList.remove('hidden'); document.getElementById('settingsPopupSpeedLayer').classList.add('hidden'); });
});

window.addEventListener('keydown', (e) => {
    if (!window.isPlayingArchive || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    switch(e.code) {
        case 'Space': e.preventDefault(); togglePlaybackEngineState(); break;
        case 'ArrowLeft': e.preventDefault(); seekToTimeDelta(-10); break;
        case 'ArrowRight': e.preventDefault(); seekToTimeDelta(10); break;
        case 'KeyM': 
            e.preventDefault(); 
            window.camVideoFeed.muted = !window.camVideoFeed.muted; 
            const muteBtn = document.getElementById('btnModernMuteToggle');
            if(muteBtn) muteBtn.textContent = window.camVideoFeed.muted || window.camVideoFeed.volume === 0 ? "🔇" : (window.camVideoFeed.volume > 0.5 ? "🔊" : "🔉"); 
            const volSlider = document.getElementById('playerVolumeSlider');
            if(volSlider) volSlider.value = window.camVideoFeed.muted ? 0 : (window.camVideoFeed.volume || 1); 
            break;
    }
    if (e.key === '>' || (e.shiftKey && e.key === '.')) { e.preventDefault(); window.changePlaybackSpeed('up'); }
    if (e.key === '<' || (e.shiftKey && e.key === ',')) { e.preventDefault(); window.changePlaybackSpeed('down'); }
});

// --- ZIP EXTRACTION & HYDRATION ---
document.getElementById('archiveFileLoader').addEventListener('change', async function(e) {
    const file = e.target.files[0]; if (!file) return; 

    const titleEl = document.querySelector('.home-title');
    const originalTitle = titleEl.textContent;
    titleEl.textContent = "Unpacking Archive...";
    
    try {
        if (window.activeBlobUrls) window.activeBlobUrls.forEach(url => URL.revokeObjectURL(url));
        window.activeBlobUrls = [];

        const zip = await JSZip.loadAsync(file);
        const dataJsonStr = await zip.file("data.json").async("string");
        const unpackedPayload = JSON.parse(dataJsonStr);

        const videoBlob = await zip.file("video.webm").async("blob");
        const videoUrl = URL.createObjectURL(videoBlob);
        window.activeBlobUrls.push(videoUrl);

        for (let i = 0; i < unpackedPayload.slides.length; i++) {
            const slide = unpackedPayload.slides[i];
            if (slide.sourceUrl && !slide.sourceUrl.startsWith('data:')) {
                const imgBlob = await zip.file(slide.sourceUrl).async("blob");
                const imgUrl = URL.createObjectURL(imgBlob);
                slide.sourceUrl = imgUrl;
                window.activeBlobUrls.push(imgUrl);
            }
            if (slide.thumbnail && !slide.thumbnail.startsWith('data:')) {
                const thumbBlob = await zip.file(slide.thumbnail).async("blob");
                const thumbUrl = URL.createObjectURL(thumbBlob);
                slide.thumbnail = thumbUrl;
                window.activeBlobUrls.push(thumbUrl);
            }
        }

        window.archivedTimeline = (unpackedPayload.timeline || []).map(ev => {
            if (Array.isArray(ev)) {
                if (ev[1] === 'c') return { tick: ev[0], type: 'cursor', x: ev[2], y: ev[3] };
                if (ev[1] === 'd') return { tick: ev[0], type: 'draw-move', x: ev[2], y: ev[3] };
            }
            return ev;
        });

        const liveDrawnIds = new Set();
        window.archivedTimeline.forEach(ev => { 
            if (ev.objectId) liveDrawnIds.add(ev.objectId); 
            if (ev.type === 'insert-image' && ev.targetId) liveDrawnIds.add(ev.targetId);
        });

        window.baseAnnotationsDeck = [];
        (unpackedPayload.slides || []).forEach((slide, sIdx) => {
            if (!slide.annotation) return;
            try {
                const data = JSON.parse(slide.annotation);
                (data.objects || []).forEach(obj => {
                    if (!liveDrawnIds.has(obj.id)) {
                        obj.slideIndex = sIdx;
                        window.baseAnnotationsDeck.push(obj);
                    }
                });
            } catch(err) {}
        });

        window.isPlayingArchive = true; window.globalSlidesDeck = unpackedPayload.slides; 
        document.getElementById('homeViewContainer').classList.add('hidden'); 
	dragBox.style.display = 'flex';
window.isSlideModeActive = false; document.body.classList.remove('sidebar-open'); window.renderFlatSlideSorterUI();

        window.camVideoFeed.src = videoUrl; window.camVideoFeed.muted = false; 
        window.camVideoFeed.onloadedmetadata = () => {
            window.seekbar.max = window.camVideoFeed.duration; playbackEventPointerIndex = 0; window.currentPlaybackRate = 1.0; 
            setTimeout(() => { window.syncCanvasDimensionsToWrapper(); window.reconstructCanvasStateToTimestamp(0); window.camVideoFeed.play(); window.playPauseBtn.textContent = "⏸"; window.executePlaybackSynchronizationLoop(); }, 100);
        };
    } catch (err) { 
        console.error(err);
        alert("Archive Extraction Failed. Ensure this file was built on V5 of the Recorder platform."); 
    } finally {
        titleEl.textContent = originalTitle;
        this.value = '';
    }
});

function findSlideStartPlaybackTick(slideIdx) {
    let firstSwitchTick = null; let firstDrawTick = null;
    for (let i = 0; i < window.archivedTimeline.length; i++) {
        const ev = window.archivedTimeline[i];
        if (ev.type === 'slide-switch' && ev.index === slideIdx) { if (firstSwitchTick === null) firstSwitchTick = ev.tick; }
        if (ev.type === 'draw-start' && ev.slideIndex === slideIdx) { if (firstDrawTick === null) firstDrawTick = ev.tick; }
    }
    if (firstSwitchTick !== null) return firstSwitchTick;
    if (firstDrawTick !== null) return firstDrawTick;
    return 0;
}

window.jumpToSlideIndex = function(index, e) {
    const clickedPlayIcon = e && e.target && e.target.classList.contains('play-overlay');

    if (clickedPlayIcon && !window.areAnnotationsVisible) {
        window.areAnnotationsVisible = true;
        const pillOn = document.getElementById('pillVectorsOn');
        const pillOff = document.getElementById('pillVectorsOff');
        if (pillOn) pillOn.classList.add('active');
        if (pillOff) pillOff.classList.remove('active');
    }

    window.activeSlideIndex = index; 
    window.renderFlatSlideSorterUI();

    if (window.isSlideModeActive && !clickedPlayIcon) {
        window.applySlideBackground(window.globalSlidesDeck[window.activeSlideIndex]);
        window.canvas.clear(); window.applySlideBackground(window.globalSlidesDeck[window.activeSlideIndex]);
        if (window.areAnnotationsVisible && window.globalSlidesDeck[window.activeSlideIndex].annotation) {
            window.canvas.loadFromJSON(window.globalSlidesDeck[window.activeSlideIndex].annotation, () => { window.canvas.forEachObject(obj => { obj.selectable = false; }); window.canvas.renderAll(); });
        }
    } else {
        if (window.isSlideModeActive) {
            const originalReconstruct = window.reconstructCanvasStateToTimestamp;
            window.reconstructCanvasStateToTimestamp = function() {}; 
            window.toggleSlideMode(false); 
            window.reconstructCanvasStateToTimestamp = originalReconstruct; 
        }
        
        const targetTick = findSlideStartPlaybackTick(index);
        window.camVideoFeed.currentTime = targetTick / 1000; 
        window.camVideoFeed.playbackRate = window.currentPlaybackRate; 
        window.reconstructCanvasStateToTimestamp(targetTick);
        
        if (window.camVideoFeed.paused) { 
            window.camVideoFeed.play(); 
            window.playPauseBtn.textContent = "⏸"; 
            window.executePlaybackSynchronizationLoop(); 
        }
    }
}

function togglePlaybackEngineState() {
    if (!window.isPlayingArchive || window.isSlideModeActive) return;
    if (window.camVideoFeed.paused) { window.camVideoFeed.play(); window.camVideoFeed.playbackRate = window.currentPlaybackRate; window.playPauseBtn.textContent = "⏸"; window.executePlaybackSynchronizationLoop(); }
    else { window.camVideoFeed.pause(); window.playPauseBtn.textContent = "▶"; cancelAnimationFrame(playbackRenderAnimationFrameLoopId); }
}
window.playPauseBtn.addEventListener('click', togglePlaybackEngineState);
document.getElementById('btnRewindTenSeconds').addEventListener('click', () => seekToTimeDelta(-10));
document.getElementById('btnForwardTenSeconds').addEventListener('click', () => seekToTimeDelta(10));

function seekToTimeDelta(seconds) {
    let target = window.camVideoFeed.currentTime + seconds;
    if (target < 0) target = 0; if (target > window.camVideoFeed.duration) target = window.camVideoFeed.duration;
    window.seekbar.value = target; window.camVideoFeed.currentTime = target; window.camVideoFeed.playbackRate = window.currentPlaybackRate;
    window.reconstructCanvasStateToTimestamp(target * 1000);
}
window.seekbar.addEventListener('input', (e) => {
    if (!window.isPlayingArchive || window.isSlideModeActive) return;
    window.camVideoFeed.currentTime = parseFloat(e.target.value); window.camVideoFeed.playbackRate = window.currentPlaybackRate; 
    window.reconstructCanvasStateToTimestamp(parseFloat(e.target.value) * 1000);
});

function formatSecondsToTimerString(totalSecs) {
    if (isNaN(totalSecs)) return "00:00";
    const h = Math.floor(totalSecs / 3600); const m = Math.floor((totalSecs % 3600) / 60); const s = Math.floor(totalSecs % 60);
    const pad = v => String(v).padStart(2, '0'); return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// --- CENTRAL CURSOR STYLING ENGINE ---
// Injects High-Contrast SVG elements directly into the DOM for perfect color rendering
function updateCursorVisualState(x, y, tool, color) {
    const cursorEl = document.getElementById('playbackCursor');
    if (!cursorEl) return;
    
    const currentZoom = window.canvas.getZoom() || 1; 
    const fabricWrap = document.querySelector('.canvas-container');
    if (fabricWrap && cursorEl.parentElement !== fabricWrap) { fabricWrap.appendChild(cursorEl); }
    
    cursorEl.style.display = 'block'; 
    cursorEl.style.left = (x * currentZoom) + 'px'; 
    cursorEl.style.top = (y * currentZoom) + 'px';
    
    cursorEl.style.background = 'transparent';
    cursorEl.style.boxShadow = 'none';
    cursorEl.style.border = 'none';
    cursorEl.style.width = '26px';
    cursorEl.style.height = '26px';
    
    const hex = color || '#ffffff';
    let svgHTML = '';
    let anchorTransform = '';

    if (tool === 'eraser') { 
        svgHTML = `<svg width="26" height="26" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="4" fill="rgba(255,255,255,0.85)" stroke="black" stroke-width="2"/><rect x="5" y="5" width="14" height="14" rx="2" fill="none" stroke="#444" stroke-width="1.5" stroke-dasharray="2,2"/></svg>`;
        anchorTransform = `translate(-50%, -50%) scale(${currentZoom})`; 
    } 
    else if (tool === 'pointer') { 
        svgHTML = `<svg width="26" height="26" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="red" stroke="white" stroke-width="2"/><circle cx="12" cy="12" r="10" fill="none" stroke="red" stroke-width="2" opacity="0.6"/></svg>`;
        anchorTransform = `translate(-50%, -50%) scale(${currentZoom})`; 
    } 
    else if (tool === 'highlight') { 
        svgHTML = `<svg width="26" height="26" viewBox="0 0 24 24"><path d="M16 2 L22 8 L8 22 L0 24 L2 16 Z" fill="${hex}" opacity="0.65" stroke="black" stroke-width="2"/><path d="M14 6 L18 10" stroke="black" stroke-width="2"/><polygon points="0,24 6,22 2,18" fill="${hex}" stroke="white" stroke-width="1"/></svg>`;
        anchorTransform = `translate(0%, -100%) scale(${currentZoom})`; 
    } 
    else if (tool === 'pen' || tool === 'shape') { 
        svgHTML = `<svg width="26" height="26" viewBox="0 0 24 24"><path d="M17 2 L22 7 L7 22 L0 24 L2 17 Z" fill="${hex}" stroke="black" stroke-width="1.5"/><path d="M16 6 L18 8" stroke="black" stroke-width="1.5"/><polygon points="0,24 4,20 0,20" fill="black"/></svg>`;
        anchorTransform = `translate(0%, -100%) scale(${currentZoom})`; 
    }
    else if (tool === 'text') {
        svgHTML = `<svg width="26" height="26" viewBox="0 0 24 24"><path d="M5 4 L19 4 L19 6 L13 6 L13 18 L16 18 L16 20 L8 20 L8 18 L11 18 L11 6 L5 6 Z" fill="white" stroke="black" stroke-width="1.5"/></svg>`;
        anchorTransform = `translate(-50%, -50%) scale(${currentZoom})`; 
    }
    else { 
        svgHTML = `<svg width="26" height="26" viewBox="0 0 24 24"><path d="M0 0 L16 9 L9 11 L13 20 L10 21 L6 12 L0 16 Z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
        anchorTransform = `translate(0%, 0%) scale(${currentZoom})`; 
    }

    cursorEl.innerHTML = svgHTML;
    cursorEl.style.transform = anchorTransform;
}

window.executePlaybackSynchronizationLoop = function() {
    if (!window.isPlayingArchive || window.camVideoFeed.paused || window.camVideoFeed.ended || window.isSlideModeActive) return;

    const currentMediaTimeSeconds = window.camVideoFeed.currentTime; window.seekbar.value = currentMediaTimeSeconds;
    document.getElementById('modernPlayerTimeDisplayLabel').textContent = `${formatSecondsToTimerString(currentMediaTimeSeconds)} / ${formatSecondsToTimerString(window.camVideoFeed.duration)}`;
    const masterClockMS = currentMediaTimeSeconds * 1000; 
    const cursorEl = document.getElementById('playbackCursor');

    let canvasNeedsRender = false;

    while (playbackEventPointerIndex < window.archivedTimeline.length && window.archivedTimeline[playbackEventPointerIndex].tick <= masterClockMS) {
        const ev = window.archivedTimeline[playbackEventPointerIndex];
        
        if (ev.type === 'tool-switch') { 
            playbackDrawTool = ev.tool; 
            updateCursorVisualState(playbackLastX, playbackLastY, playbackDrawTool, playbackDrawColor);
        }
        else if (ev.type === 'cursor') {
            playbackLastX = ev.x; playbackLastY = ev.y;
            updateCursorVisualState(playbackLastX, playbackLastY, playbackDrawTool, playbackDrawColor);
        } 
        else if (ev.type === 'draw-start') {
            playbackLastX = ev.x; playbackLastY = ev.y;
            playbackDrawColor = ev.color; playbackDrawWidth = ev.width; playbackDrawTool = ev.tool;
            updateCursorVisualState(playbackLastX, playbackLastY, playbackDrawTool, playbackDrawColor);

            if (ev.slideIndex !== undefined && ev.slideIndex !== window.activeSlideIndex) {
                window.activeSlideIndex = ev.slideIndex;
                window.renderFlatSlideSorterUI();
                window.applySlideBackground(window.globalSlidesDeck[window.activeSlideIndex]);
                window.canvas.forEachObject(obj => { obj.visible = (obj.slideIndex === window.activeSlideIndex && window.areAnnotationsVisible); });
                canvasNeedsRender = true;
            }

            playbackCurrentDrawingId = ev.objectId; strokeHomeSlideIndex = ev.slideIndex !== undefined ? ev.slideIndex : window.activeSlideIndex;

            if (ev.tool === 'text') {
                playbackActiveObject = new fabric.Textbox('', { 
                    left: ev.x, top: ev.y, width: 400, fill: ev.color, fontFamily: 'Segoe UI', 
                    id: ev.objectId, fontSize: ev.fontSize || 42, selectable: false, 
                    visible: (strokeHomeSlideIndex === window.activeSlideIndex && window.areAnnotationsVisible) 
                });
                playbackActiveObject.slideIndex = strokeHomeSlideIndex; 
                window.canvas.add(playbackActiveObject); 
                canvasNeedsRender = true;
            }
            else if (ev.tool === 'shape') {
                shapeStartX = ev.x; shapeStartY = ev.y;
                const props = { id: ev.objectId, left: ev.x, top: ev.y, fill: 'transparent', stroke: ev.color, strokeWidth: ev.width, selectable: false, strokeUniform: true, visible: (strokeHomeSlideIndex === window.activeSlideIndex && window.areAnnotationsVisible) };
                
                if (ev.shapeType === 'rect') playbackActiveObject = new fabric.Rect({ ...props, width: 1, height: 1 });
                if (ev.shapeType === 'circle') playbackActiveObject = new fabric.Circle({ ...props, radius: 1, originX: 'center', originY: 'center' });
                if (ev.shapeType === 'ellipse') playbackActiveObject = new fabric.Ellipse({ ...props, rx: 1, ry: 1, originX: 'center', originY: 'center' });
                if (ev.shapeType === 'triangle') playbackActiveObject = new fabric.Triangle({ ...props, width: 1, height: 1 });
                if (ev.shapeType === 'line') playbackActiveObject = new fabric.Line([ev.x, ev.y, ev.x + 1, ev.y + 1], props);
                if (ev.shapeType === 'cube') playbackActiveObject = new fabric.Path("M 50 0 L 100 25 L 100 75 L 50 100 L 0 75 L 0 25 Z M 50 0 L 50 50 L 100 25 M 0 25 L 50 50 L 50 100", { ...props, scaleX: 0, scaleY: 0, originX: 'left', originY: 'top' });
                
                if (playbackActiveObject) { playbackActiveObject.slideIndex = strokeHomeSlideIndex; window.canvas.add(playbackActiveObject); canvasNeedsRender = true; }
            } 
            else if (ev.tool === 'pen' || ev.tool === 'highlight' || ev.tool === 'pointer') {
                playbackActivePoints = [{x: ev.x, y: ev.y}];
                const sColor = ev.tool === 'pointer' ? '#ff0000' : ev.color;
                const sOpacity = ev.tool === 'highlight' ? 0.5 : 1.0;
                const sWidth = ev.tool === 'highlight' ? ev.width * 4 : ev.width;
                
                playbackActivePathProps = { stroke: sColor, strokeWidth: sWidth, fill: 'transparent', opacity: sOpacity, strokeLineCap: 'round', strokeLineJoin: 'round', selectable: false, id: ev.objectId, slideIndex: strokeHomeSlideIndex, objectCaching: false, visible: (strokeHomeSlideIndex === window.activeSlideIndex && window.areAnnotationsVisible) };
                
                playbackActiveObject = new fabric.Path(getSmoothPathFromPoints(playbackActivePoints), playbackActivePathProps);
                window.canvas.add(playbackActiveObject); canvasNeedsRender = true;
            }
        } 
        else if (ev.type === 'draw-move') {
            playbackLastX = ev.x; playbackLastY = ev.y;
            updateCursorVisualState(playbackLastX, playbackLastY, playbackDrawTool, playbackDrawColor);

            if (playbackActiveObject && playbackDrawTool === 'shape') {
                if (playbackActiveObject.type === 'rect' || playbackActiveObject.type === 'triangle') playbackActiveObject.set({ width: Math.max(1, Math.abs(shapeStartX - ev.x)), height: Math.max(1, Math.abs(shapeStartY - ev.y)), left: Math.min(ev.x, shapeStartX), top: Math.min(ev.y, shapeStartY) });
                else if (playbackActiveObject.type === 'circle') playbackActiveObject.set({ radius: Math.max(1, Math.sqrt(Math.pow(shapeStartX - ev.x, 2) + Math.pow(shapeStartY - ev.y, 2))) });
                else if (playbackActiveObject.type === 'ellipse') playbackActiveObject.set({ rx: Math.max(1, Math.abs(shapeStartX - ev.x)), ry: Math.max(1, Math.abs(shapeStartY - ev.y)) });
                else if (playbackActiveObject.type === 'line') playbackActiveObject.set({ x2: ev.x, y2: ev.y });
                else if (playbackActiveObject.type === 'path') playbackActiveObject.set({ scaleX: Math.max(0.1, Math.abs(ev.x - shapeStartX) / 100), scaleY: Math.max(0.1, Math.abs(ev.y - shapeStartY) / 100) });
                
                playbackActiveObject.setCoords(); playbackActiveObject.dirty = true; canvasNeedsRender = true;
            } 
            else if (playbackDrawTool === 'pen' || playbackDrawTool === 'highlight' || playbackDrawTool === 'pointer') {
                if (playbackActivePoints && playbackActiveObject) { playbackActivePoints.push({x: ev.x, y: ev.y}); canvasNeedsRender = true; }
            }
        } 
        else if (ev.type === 'draw-end') {
            if (playbackActiveObject) {
                if (playbackDrawTool === 'pen' || playbackDrawTool === 'highlight' || playbackDrawTool === 'pointer') {
                    window.canvas.remove(playbackActiveObject);
                    playbackActivePathProps.objectCaching = true; 
                    playbackActiveObject = new fabric.Path(getSmoothPathFromPoints(playbackActivePoints), playbackActivePathProps);
                    window.canvas.add(playbackActiveObject);
                    
                    if (playbackDrawTool === 'pointer') {
                        const ptrLine = playbackActiveObject;
                        ptrLine.animate('opacity', 0, { duration: 1000, onChange: window.canvas.renderAll.bind(window.canvas), onComplete: () => { window.canvas.remove(ptrLine); } });
                    }
                    playbackActivePoints = []; playbackActivePathProps = null;
                } 
                else if (playbackDrawTool === 'shape') { playbackActiveObject.setCoords(); playbackActiveObject.dirty = true; }
                playbackActiveObject = null; canvasNeedsRender = true;
            }
        } 
        else if (ev.type === 'object-transform') {
            const target = window.canvas.getObjects().find(o => o.id === ev.targetId);
            if (target) { target.set({ left: ev.left, top: ev.top, scaleX: ev.scaleX, scaleY: ev.scaleY, angle: ev.angle }); target.setCoords(); target.dirty = true; canvasNeedsRender = true; } 
            else { pendingImageTransforms[ev.targetId] = { left: ev.left, top: ev.top, scaleX: ev.scaleX, scaleY: ev.scaleY, angle: ev.angle }; }
        }
        else if (ev.type === 'object-modified') {
            const target = window.canvas.getObjects().find(o => o.id === ev.targetId);
            if (target) { 
                if (ev.fontSize) target.set({ fontSize: ev.fontSize }); 
                if (ev.fill) target.set({ fill: ev.fill }); 
                if (ev.stroke) target.set({ stroke: ev.stroke }); 
                target.dirty = true; 
                canvasNeedsRender = true; 
            }
        }
        else if (ev.type === 'text-edit') {
            const targetText = window.canvas.getObjects().find(o => o.id === ev.targetId);
            if (targetText) { targetText.set({ text: ev.text }); if (!ev.text || ev.text.trim() === '') window.canvas.remove(targetText); canvasNeedsRender = true; }
        }
        else if (ev.type === 'erase-object') {
            const targets = window.canvas.getObjects().filter(o => o.id === ev.targetId || o.groupId === ev.targetId);
            targets.forEach(t => window.canvas.remove(t)); canvasNeedsRender = true;
        }
        else if (ev.type === 'canvas-undo' || ev.type === 'canvas-redo') {
            const targetIdx = window.activeSlideIndex; 
            const toRemove = window.canvas.getObjects().filter(o => o.slideIndex === targetIdx);
            toRemove.forEach(t => window.canvas.remove(t));
            const pState = JSON.parse(ev.state);
            fabric.util.enlivenObjects(pState.objects, (objs) => { objs.forEach(obj => { obj.selectable = false; if(obj.slideIndex === undefined) obj.slideIndex = targetIdx; obj.visible = (obj.slideIndex === window.activeSlideIndex && window.areAnnotationsVisible); window.canvas.add(obj); }); window.canvas.renderAll(); });
        }
        else if (ev.type === 'insert-image') {
            const activeMemSlide = window.globalSlidesDeck[window.activeSlideIndex];
            if (activeMemSlide && activeMemSlide.annotation) {
                const jsonTree = JSON.parse(activeMemSlide.annotation); const imgData = jsonTree.objects.find(o => o.id === ev.targetId);
                if (imgData && imgData.src) { 
                    const currentEpoch = window.canvasAsyncEpoch; 
                    
                    fabric.Image.fromURL(imgData.src, (img) => { 
                        if (window.canvasAsyncEpoch !== currentEpoch) return; 
                        
                        const maxW = 1920 * 0.7; const maxH = 1080 * 0.7;
                        let initialScale = 1; if (img.width > maxW || img.height > maxH) initialScale = Math.min(maxW / img.width, maxH / img.height);
                        img.set({ id: ev.targetId, slideIndex: window.activeSlideIndex, left: 960, top: 540, originX: 'center', originY: 'center', scaleX: initialScale, scaleY: initialScale, angle: 0, selectable: false, visible: window.areAnnotationsVisible });
                        if (pendingImageTransforms[ev.targetId]) { img.set(pendingImageTransforms[ev.targetId]); delete pendingImageTransforms[ev.targetId]; }
                        img.setCoords(); window.canvas.add(img); window.canvas.renderAll(); 
                    }); 
                }
            }
        }
        else if (ev.type === 'slide-switch') {
            if (window.activeSlideIndex !== ev.index) {
                window.activeSlideIndex = ev.index; window.renderFlatSlideSorterUI(); window.applySlideBackground(window.globalSlidesDeck[window.activeSlideIndex]);
                window.canvas.forEachObject(obj => { obj.visible = (obj.slideIndex === window.activeSlideIndex && window.areAnnotationsVisible); });
                canvasNeedsRender = true;
            }
        }
        playbackEventPointerIndex++;
    }
    
    if (playbackActivePoints.length > 0 && playbackActiveObject && (playbackDrawTool === 'pen' || playbackDrawTool === 'highlight' || playbackDrawTool === 'pointer')) {
        window.canvas.remove(playbackActiveObject);
        playbackActiveObject = new fabric.Path(getSmoothPathFromPoints(playbackActivePoints), playbackActivePathProps);
        window.canvas.add(playbackActiveObject);
    }

    if (canvasNeedsRender) window.canvas.renderAll();
    
    if (!window.camVideoFeed.ended) playbackRenderAnimationFrameLoopId = requestAnimationFrame(window.executePlaybackSynchronizationLoop);
    else { window.playPauseBtn.textContent = "🔄"; if (cursorEl) cursorEl.style.display = 'none'; }
}

window.reconstructCanvasStateToTimestamp = function(targetClockMS) {
    window.canvasAsyncEpoch++; 
    const currentEpoch = window.canvasAsyncEpoch; 

    window.canvas.clear(); playbackEventPointerIndex = 0; playbackActiveObject = null; playbackCurrentDrawingId = null;
    pendingImageTransforms = {}; 

    if (window.baseAnnotationsDeck && window.baseAnnotationsDeck.length > 0) {
        fabric.util.enlivenObjects(window.baseAnnotationsDeck, (enlivenedObjs) => {
            if (window.canvasAsyncEpoch !== currentEpoch) return;

            for (let i = enlivenedObjs.length - 1; i >= 0; i--) {
                const bObj = enlivenedObjs[i];
                bObj.selectable = false;
                bObj.slideIndex = window.baseAnnotationsDeck[i].slideIndex;
                bObj.visible = (bObj.slideIndex === window.activeSlideIndex && window.areAnnotationsVisible);
                
                window.canvas.add(bObj);
                window.canvas.sendToBack(bObj);
            }
            window.canvas.renderAll();
        });
    }
    
    let finalTargetSlideIdx = 0;
    let rebuildLastX = 0;
    let rebuildLastY = 0;

    for (let i = 0; i < window.archivedTimeline.length; i++) { 
        const ev = window.archivedTimeline[i];
        if (ev.tick <= targetClockMS) {
            if (ev.type === 'slide-switch') finalTargetSlideIdx = ev.index;
            else if (ev.type === 'draw-start' && ev.slideIndex !== undefined) finalTargetSlideIdx = ev.slideIndex;
        } else { break; }
    }
    
    window.activeSlideIndex = finalTargetSlideIdx; 
    window.renderFlatSlideSorterUI(); 
    window.applySlideBackground(window.globalSlidesDeck[window.activeSlideIndex]);

    let currentRebuildSlideIdx = 0; 

    while (playbackEventPointerIndex < window.archivedTimeline.length && window.archivedTimeline[playbackEventPointerIndex].tick <= targetClockMS) {
        const ev = window.archivedTimeline[playbackEventPointerIndex];
        
        if (ev.type === 'cursor' || ev.type === 'draw-start' || ev.type === 'draw-move') {
            rebuildLastX = ev.x; rebuildLastY = ev.y;
        }

        if (ev.type === 'tool-switch') { playbackDrawTool = ev.tool; }
        else if (ev.type === 'slide-switch') { currentRebuildSlideIdx = ev.index; }
        else if (ev.type === 'draw-start') {
            if (ev.slideIndex !== undefined) currentRebuildSlideIdx = ev.slideIndex; 
            
            playbackDrawColor = ev.color; playbackDrawWidth = ev.width; playbackDrawTool = ev.tool;
            playbackCurrentDrawingId = ev.objectId; strokeHomeSlideIndex = ev.slideIndex !== undefined ? ev.slideIndex : currentRebuildSlideIdx;
            
            if (ev.tool === 'text') {
                playbackActiveObject = new fabric.Textbox('', { 
                    left: ev.x, top: ev.y, width: 400, fill: ev.color, fontFamily: 'Segoe UI', 
                    id: ev.objectId, fontSize: ev.fontSize || 42, selectable: false 
                });
                playbackActiveObject.slideIndex = strokeHomeSlideIndex; 
                window.canvas.add(playbackActiveObject);
            }
            else if (ev.tool === 'shape') {
                shapeStartX = ev.x; shapeStartY = ev.y;
                const props = { id: ev.objectId, left: ev.x, top: ev.y, fill: 'transparent', stroke: ev.color, strokeWidth: ev.width, selectable: false, strokeUniform: true };
                
                if (ev.shapeType === 'rect') playbackActiveObject = new fabric.Rect({ ...props, width: 1, height: 1 });
                if (ev.shapeType === 'circle') playbackActiveObject = new fabric.Circle({ ...props, radius: 1, originX: 'center', originY: 'center' });
                if (ev.shapeType === 'ellipse') playbackActiveObject = new fabric.Ellipse({ ...props, rx: 1, ry: 1, originX: 'center', originY: 'center' });
                if (ev.shapeType === 'triangle') playbackActiveObject = new fabric.Triangle({ ...props, width: 1, height: 1 });
                if (ev.shapeType === 'line') playbackActiveObject = new fabric.Line([ev.x, ev.y, ev.x + 1, ev.y + 1], props);
                if (ev.shapeType === 'cube') playbackActiveObject = new fabric.Path("M 50 0 L 100 25 L 100 75 L 50 100 L 0 75 L 0 25 Z M 50 0 L 50 50 L 100 25 M 0 25 L 50 50 L 50 100", { ...props, scaleX: 0, scaleY: 0, originX: 'left', originY: 'top' });
                
                if (playbackActiveObject) { playbackActiveObject.slideIndex = strokeHomeSlideIndex; window.canvas.add(playbackActiveObject); }
            } 
            else if (ev.tool === 'pen' || ev.tool === 'highlight' || ev.tool === 'pointer') {
                playbackActivePoints = [{x: ev.x, y: ev.y}];
                const sColor = ev.tool === 'pointer' ? '#ff0000' : ev.color;
                const sOpacity = ev.tool === 'highlight' ? 0.5 : 1.0;
                const sWidth = ev.tool === 'highlight' ? ev.width * 4 : ev.width;
                
                playbackActivePathProps = { stroke: sColor, strokeWidth: sWidth, fill: 'transparent', opacity: sOpacity, strokeLineCap: 'round', strokeLineJoin: 'round', selectable: false, id: ev.objectId, slideIndex: strokeHomeSlideIndex, objectCaching: false };
                playbackActiveObject = new fabric.Path(getSmoothPathFromPoints(playbackActivePoints), playbackActivePathProps);
                window.canvas.add(playbackActiveObject);
            }
        }
        else if (ev.type === 'draw-move') {
            if (playbackDrawTool === 'shape' && playbackActiveObject) {
                if (playbackActiveObject.type === 'rect' || playbackActiveObject.type === 'triangle') playbackActiveObject.set({ width: Math.max(1, Math.abs(shapeStartX - ev.x)), height: Math.max(1, Math.abs(shapeStartY - ev.y)), left: Math.min(ev.x, shapeStartX), top: Math.min(ev.y, shapeStartY) });
                else if (playbackActiveObject.type === 'circle') playbackActiveObject.set({ radius: Math.max(1, Math.sqrt(Math.pow(shapeStartX - ev.x, 2) + Math.pow(shapeStartY - ev.y, 2))) });
                else if (playbackActiveObject.type === 'ellipse') playbackActiveObject.set({ rx: Math.max(1, Math.abs(shapeStartX - ev.x)), ry: Math.max(1, Math.abs(shapeStartY - ev.y)) });
                else if (playbackActiveObject.type === 'line') playbackActiveObject.set({ x2: ev.x, y2: ev.y });
                else if (playbackActiveObject.type === 'path') playbackActiveObject.set({ scaleX: Math.max(0.1, Math.abs(ev.x - shapeStartX) / 100), scaleY: Math.max(0.1, Math.abs(ev.y - shapeStartY) / 100) });
                
                playbackActiveObject.setCoords(); playbackActiveObject.dirty = true;
            } 
            else if (playbackDrawTool === 'pen' || playbackDrawTool === 'highlight' || playbackDrawTool === 'pointer') {
                if (playbackActivePoints && playbackActiveObject) {
                    playbackActivePoints.push({x: ev.x, y: ev.y});
                }
            }
        }
        else if (ev.type === 'draw-end') {
            if (playbackActiveObject) {
                if (playbackDrawTool === 'pen' || playbackDrawTool === 'highlight' || playbackDrawTool === 'pointer') {
                    window.canvas.remove(playbackActiveObject);
                    playbackActivePathProps.objectCaching = true; 
                    playbackActiveObject = new fabric.Path(getSmoothPathFromPoints(playbackActivePoints), playbackActivePathProps);
                    
                    if (playbackDrawTool === 'pointer') {
                        const timeElapsedSinceEnd = targetClockMS - ev.tick;
                        
                        if (timeElapsedSinceEnd < 1000) {
                            playbackActiveObject.set({ opacity: 1 - (timeElapsedSinceEnd / 1000) });
                            window.canvas.add(playbackActiveObject);
                            
                            const ptrLine = playbackActiveObject;
                            ptrLine.animate('opacity', 0, { 
                                duration: 1000 - timeElapsedSinceEnd, 
                                onChange: window.canvas.renderAll.bind(window.canvas), 
                                onComplete: () => { window.canvas.remove(ptrLine); } 
                            });
                        }
                    } else {
                        window.canvas.add(playbackActiveObject);
                    }
                    
                    playbackActivePoints = []; playbackActivePathProps = null;
                } else if (playbackDrawTool === 'shape') {
                    playbackActiveObject.setCoords(); playbackActiveObject.dirty = true;
                }
                playbackActiveObject = null; 
            }
        }
        else if (ev.type === 'object-transform') { const target = window.canvas.getObjects().find(o => o.id === ev.targetId); if (target) { target.set({ left: ev.left, top: ev.top, scaleX: ev.scaleX, scaleY: ev.scaleY, angle: ev.angle }); target.setCoords(); target.dirty = true; } else { pendingImageTransforms[ev.targetId] = { left: ev.left, top: ev.top, scaleX: ev.scaleX, scaleY: ev.scaleY, angle: ev.angle }; } }
        else if (ev.type === 'object-modified') { 
            const target = window.canvas.getObjects().find(o => o.id === ev.targetId); 
            if (target) { 
                if (ev.fontSize) target.set({ fontSize: ev.fontSize }); 
                if (ev.fill) target.set({ fill: ev.fill }); 
                if (ev.stroke) target.set({ stroke: ev.stroke }); 
                target.dirty = true; 
            } 
        }
        else if (ev.type === 'text-edit') { const targetText = window.canvas.getObjects().find(o => o.id === ev.targetId); if (targetText) { targetText.set({ text: ev.text }); if (!ev.text || ev.text.trim() === '') window.canvas.remove(targetText); } }
        else if (ev.type === 'erase-object') { const targets = window.canvas.getObjects().filter(o => o.id === ev.targetId || o.groupId === ev.targetId); targets.forEach(t => window.canvas.remove(t)); }
        else if (ev.type === 'canvas-undo' || ev.type === 'canvas-redo') { 
            const toRemove = window.canvas.getObjects().filter(o => o.slideIndex === currentRebuildSlideIdx);
            toRemove.forEach(t => window.canvas.remove(t));
            const pState = JSON.parse(ev.state);
            fabric.util.enlivenObjects(pState.objects, (objs) => { objs.forEach(obj => { obj.selectable = false; if(obj.slideIndex === undefined) obj.slideIndex = currentRebuildSlideIdx; obj.visible = (obj.slideIndex === window.activeSlideIndex && window.areAnnotationsVisible); window.canvas.add(obj); }); }); 
        }
        else if (ev.type === 'insert-image') {
            const memSlide = window.globalSlidesDeck[currentRebuildSlideIdx];
            if (memSlide && memSlide.annotation) {
                const jsonTree = JSON.parse(memSlide.annotation); const imgData = jsonTree.objects.find(o => o.id === ev.targetId);
                if (imgData && imgData.src) { 
                    const imageHomeSlideIndex = currentRebuildSlideIdx;
                    
                    fabric.Image.fromURL(imgData.src, (img) => { 
                        if (window.canvasAsyncEpoch !== currentEpoch) return; 

                        const maxW = 1920 * 0.7; const maxH = 1080 * 0.7;
                        let initialScale = 1; if (img.width > maxW || img.height > maxH) initialScale = Math.min(maxW / img.width, maxH / img.height);
                        
                        img.set({ 
                            id: ev.targetId, 
                            slideIndex: imageHomeSlideIndex, 
                            left: 960, top: 540, originX: 'center', originY: 'center', 
                            scaleX: initialScale, scaleY: initialScale, angle: 0, selectable: false,
                            visible: (imageHomeSlideIndex === window.activeSlideIndex && window.areAnnotationsVisible)
                        });
                        
                        if (pendingImageTransforms[ev.targetId]) { img.set(pendingImageTransforms[ev.targetId]); delete pendingImageTransforms[ev.targetId]; }
                        img.setCoords(); 
                        window.canvas.add(img); 
                        window.canvas.renderAll();
                    }); 
                }
            }
        }
        playbackEventPointerIndex++;
    }

    playbackLastX = rebuildLastX;
    playbackLastY = rebuildLastY;
    updateCursorVisualState(playbackLastX, playbackLastY, playbackDrawTool, playbackDrawColor);

    if (playbackActivePoints.length > 0 && playbackActiveObject && (playbackDrawTool === 'pen' || playbackDrawTool === 'highlight' || playbackDrawTool === 'pointer')) {
        window.canvas.remove(playbackActiveObject);
        playbackActiveObject = new fabric.Path(getSmoothPathFromPoints(playbackActivePoints), playbackActivePathProps);
        window.canvas.add(playbackActiveObject);
    }
    
    window.canvas.forEachObject(obj => { obj.visible = (obj.slideIndex === window.activeSlideIndex && window.areAnnotationsVisible); }); 
    window.canvas.renderAll();
}