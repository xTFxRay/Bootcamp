// Every API reply uses { success, data, error } (see CLAUDE.md).
export const ok = (res, data, code = 200) => res.status(code).json({ success: true, data, error: null });
export const fail = (res, code, error) => res.status(code).json({ success: false, data: null, error });
