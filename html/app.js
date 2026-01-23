/**
 * Storyboard Viewer - Application Logic
 * Vanilla JavaScript with immutable state management
 */

// ========================================
// State Management
// ========================================

const state = {
    projects: [],
    selectedProject: null,
    selectedStyle: null,
    selectedOrientation: 'horizontal',
    storyboard: null,
    editingIndex: null,
    loading: true,
    error: null,
};

// ========================================
// DOM Elements
// ========================================

const elements = {
    loading: document.getElementById('loading'),
    errorState: document.getElementById('error-state'),
    errorMessage: document.getElementById('error-message'),
    emptyState: document.getElementById('empty-state'),
    projectList: document.getElementById('project-list'),
    projectGrid: document.getElementById('project-grid'),
    storyboardView: document.getElementById('storyboard-view'),
    storyboardFilename: document.getElementById('storyboard-filename'),
    storyboardStyle: document.getElementById('storyboard-style'),
    storyboardOrientation: document.getElementById('storyboard-orientation'),
    storyboardStats: document.getElementById('storyboard-stats'),
    styleSelector: document.getElementById('style-selector'),
    styleTabs: document.getElementById('style-tabs'),
    timeline: document.getElementById('timeline'),
    editModal: document.getElementById('edit-modal'),
    queryInput: document.getElementById('query-input'),
    shotTypeGroup: document.getElementById('shot-type-group'),
    segmentText: document.getElementById('segment-text'),
    toastContainer: document.getElementById('toast-container'),
    confirmClearModal: document.getElementById('confirm-clear-modal'),
    confirmInput: document.getElementById('confirm-input'),
    confirmClearSubmit: document.getElementById('confirm-clear-submit'),
};

// ========================================
// API Functions
// ========================================

const API_BASE = '';

async function fetchProjects() {
    const response = await fetch(`${API_BASE}/api/projects`);
    if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
    }
    return response.json();
}

async function fetchStoryboard(audioHash, styleId, orientation = 'horizontal', naturalEdit = false) {
    const response = await fetch(
        `${API_BASE}/api/storyboard/${audioHash}/${styleId}?orientation=${orientation}&naturalEdit=${naturalEdit}`
    );
    if (!response.ok) {
        throw new Error(`Failed to fetch storyboard: ${response.statusText}`);
    }
    return response.json();
}

async function updateQuery(audioHash, styleId, index, query, type, orientation = 'horizontal', naturalEdit = false) {
    const response = await fetch(
        `${API_BASE}/api/query/${audioHash}/${styleId}/${index}?orientation=${orientation}&naturalEdit=${naturalEdit}`,
        {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, type }),
        }
    );
    if (!response.ok) {
        throw new Error(`Failed to update query: ${response.statusText}`);
    }
    return response.json();
}

async function clearImages(audioHash, styleId, orientation = 'horizontal', naturalEdit = false) {
    const response = await fetch(
        `${API_BASE}/api/images/${audioHash}/${styleId}?orientation=${orientation}&naturalEdit=${naturalEdit}`,
        { method: 'DELETE' }
    );
    if (!response.ok) {
        throw new Error(`Failed to clear images: ${response.statusText}`);
    }
    return response.json();
}

async function regenerateImage(audioHash, styleId, index, orientation = 'horizontal', naturalEdit = false) {
    const response = await fetch(
        `${API_BASE}/api/regenerate/${audioHash}/${styleId}/${index}?orientation=${orientation}&naturalEdit=${naturalEdit}`,
        { method: 'POST' }
    );
    if (!response.ok) {
        throw new Error(`Failed to regenerate image: ${response.statusText}`);
    }
    return response.json();
}

// ========================================
// Utility Functions
// ========================================

function formatDuration(seconds) {
    if (!seconds) return 'Unknown duration';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatTimestamp(ms) {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const millis = ms % 1000;
    return `${mins}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

function formatDate(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function truncateFilename(filename, maxLength = 30) {
    if (filename.length <= maxLength) return filename;
    const ext = filename.split('.').pop();
    const name = filename.slice(0, filename.length - ext.length - 1);
    const truncated = name.slice(0, maxLength - ext.length - 4) + '...';
    return truncated + '.' + ext;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========================================
// Toast Notifications
// ========================================

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    const borderColor = type === 'success' ? 'border-l-emerald-500' : 'border-l-red-500';
    toast.className = `toast-animate flex items-center gap-3 px-4 py-3 bg-bg-elevated border border-white/10 ${borderColor} border-l-[3px] rounded-lg shadow-lg`;

    const icon = document.createElement('span');
    icon.className = 'text-base';
    icon.textContent = type === 'success' ? '✓' : '✕';

    const msg = document.createElement('span');
    msg.className = 'text-sm text-zinc-100';
    msg.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(msg);
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ========================================
// Render Functions
// ========================================

function setView(view) {
    elements.loading.hidden = view !== 'loading';
    elements.errorState.hidden = view !== 'error';
    elements.emptyState.hidden = view !== 'empty';
    elements.projectList.hidden = view !== 'projects';
    elements.storyboardView.hidden = view !== 'storyboard';
}

function renderProjects() {
    if (state.projects.length === 0) {
        setView('empty');
        return;
    }

    setView('projects');
    elements.projectGrid.textContent = '';

    state.projects.forEach(project => {
        const article = document.createElement('article');
        article.className = 'bg-bg-secondary border border-white/5 rounded-xl p-5 cursor-pointer transition-all hover:bg-bg-tertiary hover:border-white/10 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-accent';
        article.tabIndex = 0;
        article.dataset.hash = project.audioHash;

        const header = document.createElement('div');
        header.className = 'flex items-start justify-between mb-3';
        const icon = document.createElement('span');
        icon.className = 'text-2xl opacity-70';
        icon.textContent = '🎵';
        const dateSpan = document.createElement('span');
        dateSpan.className = 'text-xs text-zinc-600';
        dateSpan.textContent = formatDate(project.createdAt);
        header.appendChild(icon);
        header.appendChild(dateSpan);

        const title = document.createElement('h3');
        title.className = 'font-medium text-white mb-1 leading-snug break-words';
        title.textContent = truncateFilename(project.filename, 40);

        const duration = document.createElement('p');
        duration.className = 'text-sm text-zinc-500 mb-4';
        duration.textContent = project.duration ? `Duration: ${formatDuration(project.duration)}` : 'Unknown duration';

        const stylesDiv = document.createElement('div');
        stylesDiv.className = 'flex flex-wrap gap-1.5';
        project.styles.forEach(style => {
            const badge = document.createElement('span');
            badge.className = 'px-2 py-0.5 text-xs font-medium bg-accent-dim text-accent rounded';
            badge.textContent = style.styleId;
            stylesDiv.appendChild(badge);

            if (style.hasImages) {
                const imgBadge = document.createElement('span');
                imgBadge.className = 'px-2 py-0.5 text-xs font-medium bg-emerald-500/15 text-emerald-400 rounded';
                imgBadge.textContent = 'Images';
                stylesDiv.appendChild(imgBadge);
            }
            if (style.segmentCount > 0) {
                const segBadge = document.createElement('span');
                segBadge.className = 'px-2 py-0.5 text-xs font-medium bg-amber-500/15 text-amber-400 rounded';
                segBadge.textContent = `${style.segmentCount} segs`;
                stylesDiv.appendChild(segBadge);
            }
        });

        article.appendChild(header);
        article.appendChild(title);
        article.appendChild(duration);
        article.appendChild(stylesDiv);

        article.addEventListener('click', () => selectProject(project.audioHash));
        article.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectProject(project.audioHash);
            }
        });

        elements.projectGrid.appendChild(article);
    });
}

function renderStoryboard() {
    const { storyboard, selectedProject } = state;

    if (!storyboard) {
        setView('error');
        elements.errorMessage.textContent = 'Storyboard data not found';
        return;
    }

    setView('storyboard');

    // Update header
    elements.storyboardFilename.textContent = truncateFilename(storyboard.filename, 50);
    elements.storyboardStyle.textContent = storyboard.styleId;
    elements.storyboardOrientation.textContent = storyboard.orientation;
    elements.storyboardStats.textContent = `${storyboard.entries.length} segments`;

    // Render style tabs if project has multiple styles
    const project = state.projects.find(p => p.audioHash === selectedProject);
    if (project && project.styles.length > 1) {
        elements.styleSelector.hidden = false;
        elements.styleTabs.textContent = '';

        project.styles.forEach(style => {
            const isSelected = style.styleId === storyboard.styleId &&
                style.orientation === storyboard.orientation &&
                style.naturalEdit === (storyboard.naturalEdit || false);

            const btn = document.createElement('button');
            btn.className = isSelected
                ? 'px-4 py-2 text-sm font-medium bg-accent text-white rounded-md transition-colors'
                : 'px-4 py-2 text-sm font-medium text-zinc-400 border border-white/10 hover:text-white hover:bg-white/5 rounded-md transition-colors';
            btn.dataset.style = style.styleId;
            btn.dataset.orientation = style.orientation;
            btn.dataset.naturalEdit = String(style.naturalEdit);
            btn.textContent = `${style.styleId} (${style.orientation}${style.naturalEdit ? ', Natural' : ''})`;

            btn.addEventListener('click', () => {
                selectStyle(style.styleId, style.orientation, style.naturalEdit);
            });

            elements.styleTabs.appendChild(btn);
        });
    } else {
        elements.styleSelector.hidden = true;
    }

    // Render timeline using DOM API to avoid XSS
    elements.timeline.textContent = '';

    storyboard.entries.forEach((entry, index) => {
        const duration = (entry.segment.end - entry.segment.start) / 1000;

        const article = document.createElement('article');
        article.className = 'bg-bg-secondary border border-white/5 rounded-xl overflow-hidden transition-colors hover:border-white/10';
        article.dataset.index = String(index);

        // Header
        const header = document.createElement('header');
        header.className = 'flex items-center gap-4 px-5 py-4 bg-bg-tertiary border-b border-white/5';

        const segNum = document.createElement('span');
        segNum.className = 'w-7 h-7 flex items-center justify-center bg-accent text-white text-xs font-semibold rounded-full shrink-0';
        segNum.textContent = String(index + 1);

        const segTiming = document.createElement('span');
        segTiming.className = 'flex-1 font-mono text-xs text-zinc-500';
        segTiming.textContent = `${formatTimestamp(entry.segment.start)} → ${formatTimestamp(entry.segment.end)}`;

        const segDuration = document.createElement('span');
        segDuration.className = 'text-xs text-zinc-500 bg-bg-elevated px-2 py-1 rounded';
        segDuration.textContent = `${duration.toFixed(1)}s`;

        header.appendChild(segNum);
        header.appendChild(segTiming);
        header.appendChild(segDuration);

        // Body
        const body = document.createElement('div');
        body.className = 'flex gap-5 p-5 items-start';

        // Content section
        const content = document.createElement('div');
        content.className = 'flex-1 min-w-0 flex flex-col gap-4';

        const segText = document.createElement('p');
        segText.className = 'text-zinc-100 leading-relaxed';
        segText.textContent = entry.segment.text;

        const querySection = document.createElement('div');
        querySection.className = 'flex flex-col gap-3';

        const queryLabel = document.createElement('div');
        queryLabel.className = 'flex items-center gap-2 flex-wrap';

        const labelText = document.createElement('span');
        labelText.className = 'text-xs font-medium text-zinc-500 uppercase tracking-wide';
        labelText.textContent = 'Image Query:';
        queryLabel.appendChild(labelText);

        if (entry.query?.type) {
            const typeBadge = document.createElement('span');
            typeBadge.className = 'px-2 py-0.5 text-[10px] font-medium bg-accent-dim text-accent rounded uppercase tracking-wide';
            typeBadge.textContent = entry.query.type;
            queryLabel.appendChild(typeBadge);
        }

        const editBtn = document.createElement('button');
        editBtn.className = 'px-2 py-1 text-xs font-medium text-zinc-400 bg-bg-elevated border border-white/10 rounded hover:text-white hover:bg-bg-tertiary transition-colors';
        editBtn.textContent = '✏️ Edit';
        editBtn.addEventListener('click', () => openEditModal(index));

        const regenBtn = document.createElement('button');
        regenBtn.className = 'px-2 py-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-transparent rounded hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-wait';
        regenBtn.textContent = '✨ Regenerate';
        regenBtn.addEventListener('click', () => handleRegenerate(index));

        queryLabel.appendChild(editBtn);
        queryLabel.appendChild(regenBtn);

        querySection.appendChild(queryLabel);

        if (entry.query) {
            const queryPre = document.createElement('pre');
            queryPre.className = 'font-mono text-sm text-zinc-400 bg-bg-tertiary p-4 rounded-lg border-l-2 border-accent whitespace-pre-wrap break-words max-h-44 overflow-y-auto leading-relaxed';
            queryPre.textContent = entry.query.query;
            querySection.appendChild(queryPre);
        } else {
            const emptyP = document.createElement('p');
            emptyP.className = 'text-sm text-zinc-500 italic';
            emptyP.textContent = 'No query generated';
            querySection.appendChild(emptyP);
        }

        content.appendChild(segText);
        content.appendChild(querySection);

        // Image section
        const imageDiv = document.createElement('div');
        imageDiv.className = 'w-[280px] h-[158px] shrink-0 bg-bg-tertiary rounded-lg overflow-hidden flex items-center justify-center';

        if (entry.image && entry.image.exists) {
            const img = document.createElement('img');
            img.src = entry.image.url;
            img.alt = `Generated image for segment ${index + 1}`;
            img.loading = 'lazy';
            img.className = 'w-full h-full object-cover';
            imageDiv.appendChild(img);
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'flex flex-col items-center justify-center gap-2 text-zinc-500 text-sm text-center p-4';

            const placeholderIcon = document.createElement('span');
            placeholderIcon.className = 'text-2xl opacity-50';
            placeholderIcon.textContent = '🖼️';

            const placeholderText = document.createElement('span');
            placeholderText.textContent = 'No image generated';

            placeholder.appendChild(placeholderIcon);
            placeholder.appendChild(placeholderText);
            imageDiv.appendChild(placeholder);
        }

        body.appendChild(content);
        body.appendChild(imageDiv);

        article.appendChild(header);
        article.appendChild(body);

        elements.timeline.appendChild(article);
    });
}

// ========================================
// Navigation & Actions
// ========================================

async function loadProjects() {
    state.loading = true;
    state.error = null;
    setView('loading');

    try {
        state.projects = await fetchProjects();
        state.loading = false;
        renderProjects();
    } catch (error) {
        state.loading = false;
        state.error = error.message;
        setView('error');
        elements.errorMessage.textContent = error.message;
    }
}

async function selectProject(audioHash) {
    const project = state.projects.find(p => p.audioHash === audioHash);
    if (!project || project.styles.length === 0) {
        showToast('No style data available for this project', 'error');
        return;
    }

    state.selectedProject = audioHash;

    // Select first style by default
    const firstStyle = project.styles[0];
    await selectStyle(firstStyle.styleId, firstStyle.orientation, firstStyle.naturalEdit);
}

async function selectStyle(styleId, orientation = 'horizontal', naturalEdit = false) {
    state.selectedStyle = styleId;
    state.selectedOrientation = orientation;
    state.selectedNaturalEdit = naturalEdit;
    setView('loading');

    try {
        state.storyboard = await fetchStoryboard(
            state.selectedProject,
            styleId,
            orientation,
            naturalEdit
        );
        // Add naturalEdit to storyboard response if not there
        state.storyboard.naturalEdit = naturalEdit;
        renderStoryboard();
    } catch (error) {
        setView('error');
        elements.errorMessage.textContent = error.message;
        showToast('Failed to load storyboard', 'error');
    }
}

function goBack() {
    state.selectedProject = null;
    state.selectedStyle = null;
    state.storyboard = null;
    renderProjects();
}

// ========================================
// Modal Functions
// ========================================

function openEditModal(index) {
    const entry = state.storyboard?.entries[index];
    if (!entry) return;

    state.editingIndex = index;
    elements.queryInput.value = entry.query?.query || '';

    // Set active shot type button with Tailwind classes
    const type = entry.query?.type || 'static';
    elements.shotTypeGroup.querySelectorAll('.shot-type-btn').forEach(btn => {
        const isActive = btn.dataset.value === type;
        btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
        btn.className = isActive
            ? 'shot-type-btn flex-1 px-3 py-2 text-sm font-medium bg-accent text-white rounded-md transition-colors'
            : 'shot-type-btn flex-1 px-3 py-2 text-sm font-medium text-zinc-400 hover:text-white rounded-md transition-colors';
    });

    elements.segmentText.textContent = entry.segment.text;
    elements.editModal.showModal();
    elements.queryInput.focus();
}

function closeEditModal() {
    state.editingIndex = null;
    elements.editModal.close();
}

async function saveQuery() {
    const index = state.editingIndex;
    if (index === null || !state.storyboard) return;

    const newQuery = elements.queryInput.value.trim();
    const activeBtn = elements.shotTypeGroup.querySelector('.shot-type-btn[aria-checked="true"]');
    const newType = activeBtn ? activeBtn.dataset.value : 'static';

    if (!newQuery) {
        showToast('Query cannot be empty', 'error');
        return;
    }

    try {
        await updateQuery(
            state.selectedProject,
            state.selectedStyle,
            index,
            newQuery,
            newType,
            state.selectedOrientation,
            state.selectedNaturalEdit
        );

        // Update local state
        if (state.storyboard.entries[index]?.query) {
            state.storyboard.entries[index].query.query = newQuery;
            state.storyboard.entries[index].query.type = newType;
        }

        closeEditModal();
        renderStoryboard();
        showToast('Query updated successfully');
    } catch (error) {
        showToast(`Failed to save: ${error.message}`, 'error');
    }
}

function openConfirmClearModal() {
    if (!state.selectedProject || !state.selectedStyle) return;
    elements.confirmInput.value = '';
    elements.confirmClearSubmit.disabled = true;
    elements.confirmClearModal.showModal();
    elements.confirmInput.focus();
}

function closeConfirmClearModal() {
    elements.confirmClearModal.close();
    elements.confirmInput.value = '';
    elements.confirmClearSubmit.disabled = true;
}

async function handleClearImages() {
    closeConfirmClearModal();

    try {
        await clearImages(
            state.selectedProject,
            state.selectedStyle,
            state.selectedOrientation,
            state.selectedNaturalEdit
        );

        // Refresh storyboard
        await selectStyle(state.selectedStyle, state.selectedOrientation, state.selectedNaturalEdit);
        showToast('Images cleared. Run the bot to regenerate.');
    } catch (error) {
        showToast(`Failed to clear images: ${error.message}`, 'error');
    }
}

async function handleRegenerate(index) {
    if (!state.selectedProject || !state.selectedStyle || index === null) return;

    const entry = state.storyboard?.entries[index];
    if (!entry) return;

    // Show loading state in the segment
    const segmentEl = elements.timeline.querySelector(`[data-index="${index}"]`);
    if (!segmentEl) return;

    const imgContainer = segmentEl.querySelector('.w-\\[280px\\]');
    const regenerateBtn = Array.from(segmentEl.querySelectorAll('button')).find(b => b.textContent.includes('Regenerate'));

    if (!imgContainer || !regenerateBtn) return;

    // Store original children for restoration on error
    const originalChildren = Array.from(imgContainer.childNodes).map(n => n.cloneNode(true));
    const originalBtnText = regenerateBtn.textContent;

    // Show loading state
    imgContainer.textContent = '';
    const loadingPlaceholder = document.createElement('div');
    loadingPlaceholder.className = 'flex flex-col items-center justify-center gap-2 text-zinc-500 text-sm';
    const spinner = document.createElement('div');
    spinner.className = 'spinner-small w-5 h-5 border-2 border-white/10 border-t-accent rounded-full';
    const loadingText = document.createElement('span');
    loadingText.textContent = 'Regenerating...';
    loadingPlaceholder.appendChild(spinner);
    loadingPlaceholder.appendChild(loadingText);
    imgContainer.appendChild(loadingPlaceholder);

    regenerateBtn.disabled = true;
    regenerateBtn.textContent = '⌛ Generating...';

    try {
        const result = await regenerateImage(
            state.selectedProject,
            state.selectedStyle,
            index,
            state.selectedOrientation,
            state.selectedNaturalEdit
        );

        // Update local state
        if (state.storyboard.entries[index]) {
            state.storyboard.entries[index].image = {
                exists: true,
                url: result.url,
                filePath: result.filePath
            };
        }

        // Update image
        imgContainer.textContent = '';
        const img = document.createElement('img');
        img.src = result.url;
        img.alt = `Generated image for segment ${index + 1}`;
        img.loading = 'lazy';
        img.className = 'w-full h-full object-cover';
        imgContainer.appendChild(img);

        showToast(`Image ${index + 1} regenerated successfully`);
    } catch (error) {
        imgContainer.textContent = '';
        originalChildren.forEach(child => imgContainer.appendChild(child));
        showToast(`Failed to regenerate: ${error.message}`, 'error');
    } finally {
        regenerateBtn.disabled = false;
        regenerateBtn.textContent = originalBtnText;
    }
}

// ========================================
// Event Listeners
// ========================================

document.getElementById('btn-projects').addEventListener('click', goBack);
document.getElementById('btn-refresh').addEventListener('click', loadProjects);
document.getElementById('btn-retry').addEventListener('click', loadProjects);
document.getElementById('btn-back').addEventListener('click', goBack);
document.getElementById('btn-clear-images').addEventListener('click', openConfirmClearModal);
document.getElementById('modal-close').addEventListener('click', closeEditModal);
document.getElementById('btn-cancel').addEventListener('click', closeEditModal);
document.getElementById('btn-save').addEventListener('click', saveQuery);

// Confirm clear modal events
document.getElementById('confirm-clear-close').addEventListener('click', closeConfirmClearModal);
document.getElementById('confirm-clear-cancel').addEventListener('click', closeConfirmClearModal);
document.getElementById('confirm-clear-submit').addEventListener('click', handleClearImages);

elements.confirmInput.addEventListener('input', (e) => {
    const isConfirm = e.target.value.toLowerCase().trim() === 'confirm';
    elements.confirmClearSubmit.disabled = !isConfirm;
});

elements.confirmInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !elements.confirmClearSubmit.disabled) {
        handleClearImages();
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (elements.confirmClearModal.open) {
            closeConfirmClearModal();
        } else if (elements.editModal.open) {
            closeEditModal();
        }
    }
});

elements.queryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        saveQuery();
    }
});

// Close modals on backdrop click
elements.editModal.addEventListener('click', (e) => {
    if (e.target === elements.editModal) {
        closeEditModal();
    }
});

elements.confirmClearModal.addEventListener('click', (e) => {
    if (e.target === elements.confirmClearModal) {
        closeConfirmClearModal();
    }
});

// ========================================
// Initialize
// ========================================

// Event listener for shot type buttons
elements.shotTypeGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.shot-type-btn');
    if (!btn) return;

    elements.shotTypeGroup.querySelectorAll('.shot-type-btn').forEach(b => {
        b.setAttribute('aria-checked', 'false');
        b.className = 'shot-type-btn flex-1 px-3 py-2 text-sm font-medium text-zinc-400 hover:text-white rounded-md transition-colors';
    });
    btn.setAttribute('aria-checked', 'true');
    btn.className = 'shot-type-btn flex-1 px-3 py-2 text-sm font-medium bg-accent text-white rounded-md transition-colors';
});

loadProjects();
