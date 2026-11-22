// Talks to the server. Every reply is { success, data, error } (see CLAUDE.md):
// returns data on success, throws an Error with the server's message otherwise.
export async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  let payload;
  try {
    payload = await res.json();
  } catch {
    // Not a reply from our API: usually the server isn't running (in development the page's own
    // server then answers with an error page). Keep the technical detail in the console, not on screen.
    console.warn(`Unexpected reply from ${method} /api${path}: HTTP ${res.status}`);
    const error = new Error(
      res.status >= 500
        ? 'Could not reach the server. Check that it is running, then try again.'
        : "The server isn't responding properly. Try again in a moment."
    );
    error.status = res.status;
    throw error;
  }
  if (!payload.success) {
    const error = new Error(payload.error || 'Something went wrong.');
    error.status = res.status; // e.g. 409 when something was changed elsewhere
    throw error;
  }
  return payload.data;
}

export const testCasesApi = {
  list: (params) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
    return request(`/test-cases?${query}`);
  },
  create: (testCase) => request('/test-cases', { method: 'POST', body: testCase }),
  update: (id, testCase) => request(`/test-cases/${id}`, { method: 'PUT', body: testCase }),
  remove: (id) => request(`/test-cases/${id}`, { method: 'DELETE' }),
};

export const bugsApi = {
  list: (params) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
    return request(`/bugs?${query}`);
  },
  get: (id) => request(`/bugs/${id}`),
  create: (bug) => request('/bugs', { method: 'POST', body: bug }),
  update: (id, bug) => request(`/bugs/${id}`, { method: 'PUT', body: bug }),
  remove: (id) => request(`/bugs/${id}`, { method: 'DELETE' }),
  changeStatus: (id, status, message) =>
    request(`/bugs/${id}/status`, { method: 'PATCH', body: { status, message } }),
  addComment: (id, message) => request(`/bugs/${id}/comments`, { method: 'POST', body: { message } }),
};

export const reportsApi = {
  list: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
    return request(`/reports?${query}`);
  },
  get: (id) => request(`/reports/${id}`),
  create: (runId) => request('/reports', { method: 'POST', body: { runId } }),
  // A plain link, not a fetch: the browser downloads the file itself.
  exportHtmlUrl: (id) => `/api/reports/${id}/export/html`,
};

export const dashboardApi = {
  metrics: () => request('/dashboard/metrics'),
  trends: () => request('/dashboard/trends'),
};

export const testRunsApi = {
  list: (params) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
    return request(`/test-runs?${query}`);
  },
  get: (id) => request(`/test-runs/${id}`),
  create: (suiteId, createdBy) => request('/test-runs', { method: 'POST', body: { suiteId, createdBy } }),
  recordResult: (runId, resultId, result, notes) =>
    request(`/test-runs/${runId}/results/${resultId}`, { method: 'PATCH', body: { result, notes } }),
};

export const testSuitesApi = {
  list: (status) => request(`/test-suites${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  get: (id) => request(`/test-suites/${id}`),
  create: (suite) => request('/test-suites', { method: 'POST', body: suite }),
  update: (id, suite) => request(`/test-suites/${id}`, { method: 'PUT', body: suite }),
  remove: (id) => request(`/test-suites/${id}`, { method: 'DELETE' }),
  // position: 1 = first; leave it out to add at the end.
  addCase: (id, testCaseId, position) =>
    request(`/test-suites/${id}/cases`, { method: 'POST', body: { testCaseId, position } }),
  removeCase: (id, testCaseId) => request(`/test-suites/${id}/cases/${testCaseId}`, { method: 'DELETE' }),
  reorder: (id, testCaseIds) => request(`/test-suites/${id}/order`, { method: 'PUT', body: { testCaseIds } }),
};
