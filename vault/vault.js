const docListEl = document.getElementById('docList');
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');
const categoryInput = document.getElementById('categoryInput');
const uploadStatus = document.getElementById('uploadStatus');

const shareModal = document.getElementById('shareModal');
const shareLinkInput = document.getElementById('shareLinkInput');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const revokeShareBtn = document.getElementById('revokeShareBtn');
const closeShareBtn = document.getElementById('closeShareBtn');
let activeShareDocId = null;

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function extOf(filename) {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toUpperCase() : 'FILE';
}

async function loadDocuments() {
  docListEl.innerHTML = '<p class="empty-note">Loading…</p>';
  try {
    const res = await fetch('/.netlify/functions/vault-list');
    if (res.status === 401) {
      window.location.href = '/vault/';
      return;
    }
    const data = await res.json();
    renderDocuments(data.documents || []);
  } catch (err) {
    docListEl.innerHTML = '<p class="empty-note">Could not load documents. Please refresh.</p>';
  }
}

function renderDocuments(docs) {
  if (!docs.length) {
    docListEl.innerHTML = '<p class="empty-note">No documents saved yet. Upload your first one above.</p>';
    return;
  }
  docListEl.innerHTML = '';
  docs.forEach((doc) => {
    const row = document.createElement('div');
    row.className = 'doc-row';
    row.innerHTML = `
      <div class="doc-icon">${extOf(doc.filename)}</div>
      <div class="doc-main">
        <div class="doc-name">${doc.filename}</div>
        <div class="doc-meta">${doc.category} &middot; ${formatSize(doc.size)} &middot; Saved ${formatDate(doc.uploadedAt)}</div>
      </div>
      <div class="doc-actions">
        <button data-action="download" data-id="${doc.id}">Download</button>
        <button data-action="share" data-id="${doc.id}" class="${doc.hasActiveShare ? 'active-share' : ''}">
          ${doc.hasActiveShare ? 'Manage Link' : 'Create Link'}
        </button>
        <button data-action="delete" data-id="${doc.id}" class="danger">Delete</button>
      </div>
    `;
    docListEl.appendChild(row);
  });
}

docListEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;

  if (action === 'download') {
    window.location.href = `/.netlify/functions/vault-download?id=${id}`;
  } else if (action === 'share') {
    activeShareDocId = id;
    const res = await fetch('/.netlify/functions/vault-share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'create' }),
    });
    const data = await res.json();
    if (data.shareUrl) {
      shareLinkInput.value = window.location.origin + data.shareUrl;
      shareModal.classList.add('open');
    }
  } else if (action === 'delete') {
    if (!confirm('Delete this document permanently? This cannot be undone.')) return;
    await fetch('/.netlify/functions/vault-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    loadDocuments();
  }
});

copyLinkBtn.addEventListener('click', () => {
  shareLinkInput.select();
  navigator.clipboard.writeText(shareLinkInput.value).then(() => {
    copyLinkBtn.textContent = 'Copied';
    setTimeout(() => { copyLinkBtn.textContent = 'Copy'; }, 1500);
  });
});

revokeShareBtn.addEventListener('click', async () => {
  if (!activeShareDocId) return;
  await fetch('/.netlify/functions/vault-share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: activeShareDocId, action: 'revoke' }),
  });
  shareModal.classList.remove('open');
  loadDocuments();
});

closeShareBtn.addEventListener('click', () => {
  shareModal.classList.remove('open');
  loadDocuments();
});

uploadBtn.addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file) {
    uploadStatus.textContent = 'Choose a file first.';
    return;
  }
  if (file.size > 4 * 1024 * 1024) {
    uploadStatus.textContent = 'File exceeds the 4MB limit.';
    return;
  }

  uploadBtn.disabled = true;
  uploadStatus.textContent = 'Saving…';

  const reader = new FileReader();
  reader.onload = async () => {
    const base64Data = reader.result.split(',')[1];
    try {
      const res = await fetch('/.netlify/functions/vault-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          base64Data,
          category: categoryInput.value,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        uploadStatus.textContent = err.error || 'Upload failed.';
      } else {
        uploadStatus.textContent = 'Saved.';
        fileInput.value = '';
        loadDocuments();
      }
    } catch {
      uploadStatus.textContent = 'Upload failed. Please try again.';
    } finally {
      uploadBtn.disabled = false;
      setTimeout(() => { uploadStatus.textContent = ''; }, 3000);
    }
  };
  reader.readAsDataURL(file);
});

loadDocuments();

// Log out automatically when leaving the vault — either by navigating to
// another page on the site, or by closing the tab/browser entirely.
// pagehide fires reliably in both cases (unlike the older 'unload' event),
// but not on a simple tab switch or minimizing the window, so a brief
// glance at another tab won't log you out.
window.addEventListener('pagehide', () => {
  navigator.sendBeacon('/vault/logout', new Blob([], { type: 'text/plain' }));
});
