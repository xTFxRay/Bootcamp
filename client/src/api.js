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
    throw new Error('Could not reach the server.');
  }

  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new Error(`The server sent an unexpected reply (HTTP ${res.status}).`);
  }
  if (!payload.success) throw new Error(payload.error || 'Something went wrong.');
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

export const testSuitesApi = {
  list: (status) => request(`/test-suites${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  get: (id) => request(`/test-suites/${id}`),
  create: (suite) => request('/test-suites', { method: 'POST', body: suite }),
  update: (id, suite) => request(`/test-suites/${id}`, { method: 'PUT', body: suite }),
  remove: (id) => request(`/test-suites/${id}`, { method: 'DELETE' }),
  addCase: (id, testCaseId) => request(`/test-suites/${id}/cases`, { method: 'POST', body: { testCaseId } }),
  removeCase: (id, testCaseId) => request(`/test-suites/${id}/cases/${testCaseId}`, { method: 'DELETE' }),
  reorder: (id, testCaseIds) => request(`/test-suites/${id}/order`, { method: 'PUT', body: { testCaseIds } }),
};
