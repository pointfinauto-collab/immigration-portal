/* ==========================================================================
   app.js — Shared API client, auth helpers, and UI utilities
   Used across all pages of the Canadian Immigration Client Portal
   ========================================================================== */

// Set this to your deployed backend URL, or leave as relative '/api' if
// the frontend is served by the same Express server.
const API_BASE_URL = window.API_BASE_URL || '/api';

/* --------------------------------------------------------------------------
   Token storage
   -------------------------------------------------------------------------- */

const TokenStore = {
  getAccessToken() {
    return localStorage.getItem('accessToken');
  },
  getRefreshToken() {
    return localStorage.getItem('refreshToken');
  },
  getUserType() {
    return localStorage.getItem('userType'); // 'client' | 'admin'
  },
  setTokens({ accessToken, refreshToken, userType }) {
    if (accessToken) localStorage.setItem('accessToken', accessToken);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    if (userType) localStorage.setItem('userType', userType);
  },
  clear() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userType');
    localStorage.removeItem('currentUser');
  },
  setCurrentUser(user) {
    localStorage.setItem('currentUser', JSON.stringify(user));
  },
  getCurrentUser() {
    const raw = localStorage.getItem('currentUser');
    return raw ? JSON.parse(raw) : null;
  }
};

/* --------------------------------------------------------------------------
   API request helper with automatic token refresh
   -------------------------------------------------------------------------- */

/**
 * Makes an authenticated API request. Automatically attaches the access
 * token, and retries once with a refreshed token on a 401 response.
 *
 * @param {string} endpoint - e.g. '/client/dashboard'
 * @param {object} options - fetch options (method, body, headers, isFormData)
 * @returns {Promise<object>} parsed JSON response
 */
async function apiRequest(endpoint, options = {}) {
  const { method = 'GET', body, isFormData = false, skipAuth = false } = options;

  const headers = {};
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const accessToken = TokenStore.getAccessToken();
  if (accessToken && !skipAuth) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const fetchOptions = {
    method,
    headers
  };

  if (body !== undefined) {
    fetchOptions.body = isFormData ? body : JSON.stringify(body);
  }

  let response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);

  // Attempt token refresh on 401
  if (response.status === 401 && !skipAuth && TokenStore.getRefreshToken()) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${TokenStore.getAccessToken()}`;
      response = await fetch(`${API_BASE_URL}${endpoint}`, { ...fetchOptions, headers });
    }
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    data = { success: false, message: 'Unexpected server response.' };
  }

  if (!response.ok) {
    const error = new Error(data.message || 'Request failed.');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function tryRefreshToken() {
  try {
    const refreshToken = TokenStore.getRefreshToken();
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.success && data.data.accessToken) {
      TokenStore.setTokens({ accessToken: data.data.accessToken });
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

/* --------------------------------------------------------------------------
   Auth guards — call at the top of protected pages
   -------------------------------------------------------------------------- */

function requireClientAuth() {
  if (!TokenStore.getAccessToken() || TokenStore.getUserType() !== 'client') {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

function requireAdminAuth() {
  if (!TokenStore.getAccessToken() || TokenStore.getUserType() !== 'admin') {
    window.location.href = 'admin-login.html';
    return false;
  }
  return true;
}

function logoutAndRedirect(redirectTo) {
  apiRequest('/auth/logout', { method: 'POST' }).catch(() => {});
  TokenStore.clear();
  window.location.href = redirectTo || 'login.html';
}

/* --------------------------------------------------------------------------
   UI helper functions
   -------------------------------------------------------------------------- */

/**
 * Displays an alert message inside a container element.
 * @param {string} containerId - id of the element to render the alert into
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 */
function showAlert(containerId, message, type = 'info') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `<div class="alert alert-${type}" role="alert">${escapeHtml(message)}</div>`;
  container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearAlert(containerId) {
  const container = document.getElementById(containerId);
  if (container) container.innerHTML = '';
}

/**
 * Escapes HTML special characters to prevent XSS when inserting
 * dynamic text content into the DOM.
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Converts an application status string into a CSS class suffix.
 */
function statusToClass(status) {
  return String(status).toLowerCase().replace(/ /g, '-');
}

/**
 * Formats a date string into a readable Canadian-style date.
 */
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateTime(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatCurrency(amount, currency = 'CAD') {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(amount);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Toggles the mobile navigation menu.
 */
function initMobileNav() {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.main-nav');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
}

/**
 * Sets the current year in elements with the .current-year class (footer).
 */
function setCurrentYear() {
  document.querySelectorAll('.current-year').forEach((el) => {
    el.textContent = new Date().getFullYear();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initMobileNav();
  setCurrentYear();
});

/* --------------------------------------------------------------------------
   Application status progress tracker rendering
   -------------------------------------------------------------------------- */

const APPLICATION_STATUSES = [
  'Draft',
  'Submitted',
  'Under Review',
  'Additional Documents Required',
  'Approved',
  'Completed'
];

/**
 * Renders a progress tracker for an application status.
 * Handles the 'Refused' and 'Additional Documents Required' branch statuses.
 */
function renderProgressTracker(containerId, currentStatus) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let steps = [...APPLICATION_STATUSES];
  let currentIndex = steps.indexOf(currentStatus);

  if (currentStatus === 'Refused') {
    steps = ['Draft', 'Submitted', 'Under Review', 'Refused'];
    currentIndex = steps.length - 1;
  }

  const html = steps
    .map((step, idx) => {
      let cls = '';
      if (currentStatus === 'Refused' && step === 'Refused') {
        cls = 'refused current';
      } else if (idx < currentIndex) {
        cls = 'completed';
      } else if (idx === currentIndex) {
        cls = 'current';
      }
      return `
        <li class="progress-step ${cls}">
          <span class="step-circle">${idx < currentIndex || cls.includes('completed') ? '&#10003;' : idx + 1}</span>
          <span class="step-label">${escapeHtml(step)}</span>
        </li>`;
    })
    .join('');

  container.innerHTML = `<ol class="progress-tracker">${html}</ol>`;
}
