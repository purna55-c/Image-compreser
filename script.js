document.addEventListener('DOMContentLoaded', () => {
    const uploadSection = document.getElementById('upload-section');
    const workspaceSection = document.getElementById('workspace-section');
    const fileInput = document.getElementById('file-input');
    const imagesContainer = document.getElementById('images-container');
    const qualitySlider = document.getElementById('quality-slider');
    const qualityValue = document.getElementById('quality-value');
    const formatSelect = document.getElementById('format-select');
    const targetSizeInput = document.getElementById('target-size');
    const resetBtn = document.getElementById('reset-btn');
    const downloadAllBtn = document.getElementById('download-all-btn');
    const themeToggle = document.getElementById('theme-toggle');

    let imageStates = new Map(); // Store state for all images

    // Theme logic
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
    }

    themeToggle.addEventListener('click', () => {
        if (document.body.getAttribute('data-theme') === 'dark') {
            document.body.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
        } else {
            document.body.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
        }
    });

    // Drag and drop setup
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadSection.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadSection.addEventListener(eventName, () => {
            uploadSection.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadSection.addEventListener(eventName, () => {
            uploadSection.classList.remove('dragover');
        }, false);
    });

    uploadSection.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        handleFiles(dt.files);
    });

    // Clicking Upload Setup
    uploadSection.addEventListener('click', (e) => {
        // Only trigger if we didn't click the browse button directly
        if(e.target !== fileInput && !e.target.closest('button')) {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
        this.value = ''; // Reset
    });

    // Control Listeners
    qualitySlider.addEventListener('input', (e) => {
        qualityValue.textContent = e.target.value + '%';
    });

    let debounceTimeout;
    qualitySlider.addEventListener('input', () => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            recompressAll();
        }, 300); // 300ms debounce on slider for performance
    });

    formatSelect.addEventListener('change', () => recompressAll());
    targetSizeInput.addEventListener('change', () => recompressAll());

    resetBtn.addEventListener('click', () => {
        imageStates.forEach(state => {
            if (state.compressedUrl) URL.revokeObjectURL(state.compressedUrl);
        });
        imageStates.clear();
        imagesContainer.innerHTML = '';
        workspaceSection.classList.add('hidden');
        uploadSection.style.display = 'block';
    });

    downloadAllBtn.addEventListener('click', () => {
        imageStates.forEach(state => {
            if (state.compressedBlob) {
                downloadImage(state);
            }
        });
    });

    function handleFiles(files) {
        if (files.length === 0) return;
        
        uploadSection.style.display = 'none';
        workspaceSection.classList.remove('hidden');

        Array.from(files).forEach(file => {
            if (!file.type.match('image.*')) return; // skip non-images
            
            const id = 'img_' + Date.now().toString() + Math.random().toString(36).substr(2, 5);
            
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const state = {
                        id,
                        originalFile: file,
                        originalDataUrl: e.target.result,
                        imageObj: img,
                        compressedBlob: null,
                        compressedUrl: null
                    };
                    imageStates.set(id, state);
                    createImageCard(state);
                    compressImage(id);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    function createImageCard(state) {
        const card = document.createElement('div');
        card.className = 'image-card';
        card.id = `card-${state.id}`;

        const origSizeStr = formatBytes(state.originalFile.size);
        const formatStr = state.originalFile.type.split('/')[1].toUpperCase();

        card.innerHTML = `
            <button class="remove-btn" onclick="removeImage('${state.id}')" title="Remove">
                <i class="fa-solid fa-xmark"></i>
            </button>
            
            <div class="preview-col original-col">
                <div class="preview-title">
                    <span>Original</span>
                </div>
                <div class="preview-img-container">
                    <img src="${state.originalDataUrl}" alt="Original">
                </div>
                <div class="stats">
                    <div class="stat-item">
                        <span class="stat-label">File Size</span>
                        <span class="stat-value">${origSizeStr}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Format</span>
                        <span class="stat-value">${formatStr}</span>
                    </div>
                </div>
            </div>

            <div class="preview-col compressed-col" id="compressed-col-${state.id}">
                <div class="preview-title">
                    <span>Compressed</span>
                    <div class="loader" id="loader-${state.id}"></div>
                </div>
                <div class="preview-img-container">
                    <img id="comp-img-${state.id}" src="" alt="Compressed preview" style="display:none;">
                </div>
                <div class="stats" id="comp-stats-${state.id}" style="display:none;">
                    <div class="stat-item">
                        <span class="stat-label">New Size</span>
                        <span class="stat-value" id="comp-size-${state.id}">-</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Saved</span>
                        <span class="stat-value savings-badge" id="comp-saved-${state.id}">-</span>
                    </div>
                </div>
            </div>

            <div class="card-actions">
                <button class="primary-btn" id="download-btn-${state.id}" style="display:none;" onclick="downloadImageById('${state.id}')">
                    <i class="fa-solid fa-download"></i> Download
                </button>
            </div>
        `;
        
        imagesContainer.prepend(card);
    }

    // Making functions globally available for inline onclick attributes
    window.removeImage = (id) => {
        const state = imageStates.get(id);
        if (state && state.compressedUrl) {
            URL.revokeObjectURL(state.compressedUrl);
        }
        imageStates.delete(id);
        const card = document.getElementById(`card-${id}`);
        if(card) card.remove();
        
        if (imageStates.size === 0) {
            workspaceSection.classList.add('hidden');
            uploadSection.style.display = 'block';
        }
    };

    window.downloadImageById = (id) => {
        const state = imageStates.get(id);
        if (state) downloadImage(state);
    };

    function downloadImage(state) {
        if (!state.compressedUrl) return;
        const link = document.createElement('a');
        link.href = state.compressedUrl;
        
        // Clean filename logic
        const origNameParts = state.originalFile.name.split('.');
        const ext = origNameParts.pop();
        const baseName = origNameParts.join('.');
        
        const finalType = state.compressedBlob.type;
        let finalExt = ext;
        if (finalType === 'image/jpeg') finalExt = 'jpg';
        else if (finalType === 'image/webp') finalExt = 'webp';
        else if (finalType === 'image/png') finalExt = 'png';

        link.download = `${baseName}-compressed.${finalExt}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function recompressAll() {
        imageStates.forEach((state, id) => {
            compressImage(id);
        });
    }

    async function compressImage(id) {
        const state = imageStates.get(id);
        if (!state) return;

        const loader = document.getElementById(`loader-${id}`);
        const col = document.getElementById(`compressed-col-${id}`);
        const compImg = document.getElementById(`comp-img-${id}`);
        const statsRow = document.getElementById(`comp-stats-${id}`);
        const dlBtn = document.getElementById(`download-btn-${id}`);
        
        if(loader) loader.style.display = 'block';
        if(col) col.classList.add('compressing');

        // Let UI render loader
        await new Promise(r => setTimeout(r, 10));

        let quality = parseInt(qualitySlider.value) / 100;
        let targetType = formatSelect.value;
        if (targetType === 'keep') {
            targetType = state.originalFile.type;
        }

        let finalBlob = null;
        const targetSize = parseFloat(targetSizeInput.value) * 1024; // in bytes

        try {
            if (targetSize && targetSize > 0 && targetSize < state.originalFile.size && (targetType === 'image/jpeg' || targetType === 'image/webp')) {
                // Binary searching best quality to reach target size
                let minQ = 0.01;
                let maxQ = 1.0;
                let bestBlob = null;
                
                for (let i = 0; i < 6; i++) {
                    let midQ = (minQ + maxQ) / 2;
                    const blob = await getCanvasBlob(state.imageObj, targetType, midQ);
                    
                    if (blob.size <= targetSize) {
                        bestBlob = blob;
                        minQ = midQ; // Try to increase quality slightly
                    } else {
                        maxQ = midQ; // Decrease quality
                    }
                }
                finalBlob = bestBlob || await getCanvasBlob(state.imageObj, targetType, 0.01); 
            } else {
                finalBlob = await getCanvasBlob(state.imageObj, targetType, quality);
            }

            if (state.compressedUrl) {
                URL.revokeObjectURL(state.compressedUrl);
            }
            
            state.compressedBlob = finalBlob;
            state.compressedUrl = URL.createObjectURL(finalBlob);

            // Update UI
            if(compImg && statsRow && dlBtn) {
                compImg.src = state.compressedUrl;
                compImg.style.display = 'block';
                statsRow.style.display = 'flex';
                dlBtn.style.display = 'inline-flex';

                document.getElementById(`comp-size-${id}`).textContent = formatBytes(finalBlob.size);
                
                const savedEl = document.getElementById(`comp-saved-${id}`);
                if (finalBlob.size < state.originalFile.size) {
                    const percent = ((state.originalFile.size - finalBlob.size) / state.originalFile.size * 100).toFixed(1);
                    savedEl.innerHTML = `<i class="fa-solid fa-arrow-down" style="margin-right:4px;"></i>${percent}%`;
                    savedEl.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
                    savedEl.style.color = 'var(--success-color)';
                } else {
                    const percent = ((finalBlob.size - state.originalFile.size) / state.originalFile.size * 100).toFixed(1);
                    savedEl.innerHTML = `<i class="fa-solid fa-arrow-up" style="margin-right:4px;"></i>${percent}%`;
                    savedEl.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                    savedEl.style.color = 'var(--danger-color)';
                }
            }
        } catch (err) {
            console.error('Compression error:', err);
            alert('An error occurred during compression.');
        }

        if(loader) loader.style.display = 'none';
        if(col) col.classList.remove('compressing');
    }

    function getCanvasBlob(img, type, quality) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            
            // Fill white background for transparent to jpeg
            if (type === 'image/jpeg') {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            
            // Use better rendering quality
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                resolve(blob);
            }, type, quality);
        });
    }

    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
});
