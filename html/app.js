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
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon" aria-hidden="true">${type === 'success' ? '✓' : '✕'}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
    `;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
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

    elements.projectGrid.innerHTML = state.projects.map(project => `
        <article 
            class="project-card" 
            role="listitem"
            tabindex="0"
            data-hash="${project.audioHash}"
            aria-label="${escapeHtml(project.filename)}"
        >
            <div class="project-header">
                <span class="project-icon" aria-hidden="true">🎵</span>
                <span class="project-date">${formatDate(project.createdAt)}</span>
            </div>
            <h3 class="project-title">${escapeHtml(truncateFilename(project.filename, 40))}</h3>
            <p class="project-duration">
                ${project.duration ? `Duration: ${formatDuration(project.duration)}` : 'Unknown duration'}
            </p>
            <div class="project-styles">
                ${project.styles.map(style => `
                    <span class="badge badge-style">${escapeHtml(style.styleId)}</span>
                    ${style.hasImages ? '<span class="badge badge-images">Images</span>' : ''}
                    ${style.segmentCount > 0 ? `<span class="badge badge-segments">${style.segmentCount} segs</span>` : ''}
                `).join('')}
            </div>
        </article>
    `).join('');

    // Add click handlers
    elements.projectGrid.querySelectorAll('.project-card').forEach(card => {
        card.addEventListener('click', () => selectProject(card.dataset.hash));
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectProject(card.dataset.hash);
            }
        });
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
        elements.styleTabs.innerHTML = project.styles.map(style => `
            <button 
                class="style-tab" 
                role="tab"
                aria-selected="${style.styleId === storyboard.styleId && style.orientation === storyboard.orientation && style.naturalEdit === (storyboard.naturalEdit || false)}"
                data-style="${style.styleId}"
                data-orientation="${style.orientation}"
                data-natural-edit="${style.naturalEdit}"
            >
                ${escapeHtml(style.styleId)} (${style.orientation}${style.naturalEdit ? ', Natural' : ''})
            </button>
        `).join('');

        // Add click handlers
        elements.styleTabs.querySelectorAll('.style-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                selectStyle(tab.dataset.style, tab.dataset.orientation, tab.dataset.naturalEdit === 'true');
            });
        });
    } else {
        elements.styleSelector.hidden = true;
    }

    // Render timeline
    elements.timeline.innerHTML = storyboard.entries.map((entry, index) => {
        const duration = (entry.segment.end - entry.segment.start) / 1000;

        return `
            <article class="segment-card" role="listitem" data-index="${index}">
                <header class="segment-header">
                    <span class="segment-number" aria-label="Segment ${index + 1}">${index + 1}</span>
                    <span class="segment-timing">
                        ${formatTimestamp(entry.segment.start)} → ${formatTimestamp(entry.segment.end)}
                    </span>
                    <span class="segment-duration">${duration.toFixed(1)}s</span>
                </header>
                <div class="segment-body">
                    <div class="segment-content">
                        <p class="segment-text">${escapeHtml(entry.segment.text)}</p>
                        <div class="segment-query-section">
                            <div class="segment-query-label">
                                <span class="query-label-text">Image Query:</span>
                                ${entry.query?.type
                ? `<span class="badge badge-shot-type">${escapeHtml(entry.query.type)}</span>`
                : ''}
                                <button 
                                    class="query-edit-btn" 
                                    data-index="${index}"
                                    aria-label="Edit query for segment ${index + 1}"
                                >
                                    ✏️ Edit
                                </button>
                            </div>
                            ${entry.query
                ? `<pre class="segment-query">${escapeHtml(entry.query.query)}</pre>`
                : `<p class="segment-query-empty">No query generated</p>`
            }
                        </div>
                    </div>
                    <div class="segment-image">
                        ${entry.image && entry.image.exists
                ? `<img 
                                src="${entry.image.url}" 
                                alt="Generated image for segment ${index + 1}"
                                loading="lazy"
                               />`
                : `<div class="segment-image-placeholder">
                                <span class="segment-image-placeholder-icon" aria-hidden="true">🖼️</span>
                                <span>No image generated</span>
                               </div>`
            }
                    </div>
                </div>
            </article>
        `;
    }).join('');

    // Add edit button handlers
    elements.timeline.querySelectorAll('.query-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(parseInt(btn.dataset.index, 10)));
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

    // Set active shot type button
    const type = entry.query?.type || 'static';
    elements.shotTypeGroup.querySelectorAll('.shot-type-btn').forEach(btn => {
        btn.setAttribute('aria-checked', btn.dataset.value === type ? 'true' : 'false');
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

async function handleClearImages() {
    if (!state.selectedProject || !state.selectedStyle) return;

    if (!confirm('Clear all cached images? You will need to run the workflow again to regenerate them.')) {
        return;
    }

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

// ========================================
// Event Listeners
// ========================================

document.getElementById('btn-projects').addEventListener('click', goBack);
document.getElementById('btn-refresh').addEventListener('click', loadProjects);
document.getElementById('btn-retry').addEventListener('click', loadProjects);
document.getElementById('btn-back').addEventListener('click', goBack);
document.getElementById('btn-clear-images').addEventListener('click', handleClearImages);
document.getElementById('modal-close').addEventListener('click', closeEditModal);
document.getElementById('btn-cancel').addEventListener('click', closeEditModal);
document.getElementById('btn-save').addEventListener('click', saveQuery);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elements.editModal.open) {
        closeEditModal();
    }
});

elements.queryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        saveQuery();
    }
});

// Close modal on backdrop click
elements.editModal.addEventListener('click', (e) => {
    if (e.target === elements.editModal) {
        closeEditModal();
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
    });
    btn.setAttribute('aria-checked', 'true');
});

loadProjects();
