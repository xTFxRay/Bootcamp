import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { bugsApi } from '../api.js';
import { formatDate } from '../format.js';
import { useDiscardGuard } from '../use-discard-guard.js';
import { useLeaveWarning } from '../use-leave-warning.js';
import ActivityTimeline from '../components/ActivityTimeline.jsx';
import BugForm from '../components/BugForm.jsx';
import Modal from '../components/Modal.jsx';
import SeverityBadge from '../components/SeverityBadge.jsx';

export default function BugDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // The bug list as it was when this bug was opened (filters, search, sort, page).
  const listUrl = `/bugs${location.state?.listSearch ?? ''}`;
  const { setDirty, guard } = useDiscardGuard();
  const [bug, setBug] = useState(null);
  const [loadError, setLoadError] = useState('');

  // Status change
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [statusError, setStatusError] = useState('');
  const [changingStatus, setChangingStatus] = useState(false);

  // Comments
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState('');
  const [addingComment, setAddingComment] = useState(false);

  // Ask before leaving the page with a comment or status note that hasn't been sent.
  const unsentText = comment.trim() !== '' || statusNote.trim() !== '';
  useLeaveWarning(unsentText, 'Leave this page? Your unsent comment or status note will be lost.');

  // Short confirmation of the last change, read out by screen readers.
  // Stored as { text, id }: a new id makes even a repeated message show, and be read out, again.
  const [notice, setNotice] = useState(null);
  const showNotice = (text) => setNotice({ text, id: Date.now() });

  // modal: null | 'edit' | 'delete'
  const [modal, setModal] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const closeModal = useCallback(() => setModal(null), []);

  const load = useCallback(async () => {
    try {
      setBug(await bugsApi.get(id));
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    }
  }, [id]);

  useEffect(() => {
    setBug(null);
    load();
  }, [load]);

  // The status choices depend on the current status, so reset the choice whenever it changes.
  useEffect(() => {
    setNewStatus('');
  }, [bug?.status]);

  // If the bug was changed or deleted elsewhere, show the latest version (or the "not found" page).
  const handleStale = async (err, setError) => {
    setError(err.message);
    if (err.status === 404 || err.status === 409) await load();
  };

  const handleChangeStatus = async (e) => {
    e.preventDefault();
    if (!newStatus) return setStatusError('Choose the new status first.');
    setChangingStatus(true);
    setStatusError('');
    try {
      const updated = await bugsApi.changeStatus(bug.id, newStatus, statusNote);
      setBug(updated);
      setStatusNote('');
      showNotice(`Status changed to ${updated.status}.`);
    } catch (err) {
      await handleStale(err, setStatusError);
    } finally {
      setChangingStatus(false);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return setCommentError('Write a comment first.');
    setAddingComment(true);
    setCommentError('');
    try {
      setBug(await bugsApi.addComment(bug.id, comment));
      setComment('');
      showNotice('Comment added.');
    } catch (err) {
      await handleStale(err, setCommentError);
    } finally {
      setAddingComment(false);
    }
  };

  const handleSave = async (values) => {
    try {
      setBug(await bugsApi.update(bug.id, values));
      setModal(null);
      showNotice('Changes saved.');
    } catch (err) {
      if (err.status === 404) {
        setModal(null);
        await load();
        return;
      }
      throw err; // shown inside the form
    }
  };

  const openDelete = () => {
    setDeleteError('');
    setModal('delete');
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await bugsApi.remove(bug.id);
      // The list shows "Deleted bug #id …" so it's clear the delete worked.
      navigate(listUrl, { state: { skipLeaveWarning: true, deleted: { id: bug.id, title: bug.title } } });
    } catch (err) {
      setDeleting(false);
      if (err.status === 404) {
        // Someone else deleted it first; the result is the same.
        return navigate(listUrl, { state: { skipLeaveWarning: true, deleted: { id: bug.id, title: bug.title } } });
      }
      setDeleteError(err.message);
    }
  };

  if (loadError) {
    const notFound = loadError === 'Bug not found';
    return (
      <main className="page">
        <p className="back-link"><Link to={listUrl}>← Bugs</Link></p>
        <h1>{notFound ? 'Bug not found' : "Couldn't load this bug"}</h1>
        <p>{notFound ? 'It may have been deleted.' : loadError}</p>
        {!notFound && <button type="button" className="button" onClick={load}>Try again</button>}
      </main>
    );
  }

  if (!bug) return <main className="page"><p>Loading…</p></main>;

  const isDone = bug.status === 'closed';

  return (
    <main className="page">
      <p className="back-link"><Link to={listUrl}>← Bugs</Link></p>

      <div className="page-header">
        <h1><span className="muted">#{bug.id}</span> {bug.title}</h1>
        <div className="header-actions">
          <button type="button" className="button" onClick={() => setModal('edit')}>✎ Edit</button>
          <button type="button" className="button button-danger-outline" onClick={openDelete}>🗑 Delete</button>
        </div>
      </div>

      <dl className="suite-meta">
        <div><dt>Status</dt><dd><span className={`status-text status-${bug.status}`}>{bug.status}</span></dd></div>
        <div><dt>Severity</dt><dd><SeverityBadge severity={bug.severity} /></dd></div>
        <div><dt>Priority</dt><dd><span className={`priority priority-${bug.priority}`}>{bug.priority}</span></dd></div>
        <div><dt>Environment</dt><dd>{bug.environment || <span className="muted">Not given</span>}</dd></div>
        <div><dt>Reported</dt><dd>{formatDate(bug.createdAt)}</dd></div>
        <div><dt>Updated</dt><dd>{formatDate(bug.updatedAt)}</dd></div>
      </dl>

      <div role="status" className="notice-slot">{notice && <p key={notice.id} className="notice">{notice.text}</p>}</div>

      <div className="bug-layout">
        <div className="bug-main">
          {bug.description && (
            <section className="bug-section">
              <h2>Description</h2>
              <p className="prewrap">{bug.description}</p>
            </section>
          )}
          <section className="bug-section">
            <h2>Steps to reproduce</h2>
            <ol className="bug-steps">
              {bug.steps.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          </section>
          <section className="bug-section">
            <h2>Expected</h2>
            <p className="prewrap">{bug.expected}</p>
          </section>
          <section className="bug-section">
            <h2>Actual</h2>
            <p className="prewrap">{bug.actual}</p>
          </section>
        </div>

        <aside className="bug-side">
          <form className="panel form" onSubmit={handleChangeStatus}>
            <h2>Change status</h2>
            <label>
              New status
              <select
                value={newStatus}
                onChange={(e) => {
                  setNewStatus(e.target.value);
                  setStatusError('');
                }}
                disabled={changingStatus}
              >
                <option value="">Choose new status</option>
                {bug.allowedStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <p className="hint">
              From <strong className={`status-text status-${bug.status}`}>{bug.status}</strong> a bug can go to{' '}
              {bug.allowedStatuses.join(' or ')}.
            </p>
            <label>
              <span>Note <span className="optional">(optional, saved in the activity)</span></span>
              <textarea value={statusNote} onChange={(e) => setStatusNote(e.target.value)} rows={2} maxLength={2000} />
            </label>
            {statusError && <p className="form-error" role="alert">{statusError}</p>}
            <button type="submit" className="button button-primary" disabled={changingStatus}>
              {changingStatus ? 'Changing…' : 'Change status'}
            </button>
          </form>
        </aside>
      </div>

      <section className="bug-section">
        <h2>Activity</h2>
        <ActivityTimeline activity={bug.activity} />

        <form className="form comment-form" onSubmit={handleAddComment}>
          <label>
            Add a comment
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={isDone ? 'The bug is closed, but you can still comment.' : ''}
            />
          </label>
          {commentError && <p className="form-error" role="alert">{commentError}</p>}
          <div>
            <button type="submit" className="button" disabled={addingComment}>
              {addingComment ? 'Adding…' : 'Add comment'}
            </button>
          </div>
        </form>
      </section>

      {modal === 'edit' && (
        <Modal title="Edit bug" onClose={guard(closeModal)} busy={formBusy}>
          <BugForm
            initial={bug}
            onSubmit={handleSave}
            onCancel={guard(closeModal)}
            onDirtyChange={setDirty}
            onBusyChange={setFormBusy}
          />
        </Modal>
      )}

      {modal === 'delete' && (
        <Modal title="Delete bug?" onClose={closeModal} busy={deleting}>
          <p>“{bug.title}” and its activity history will be deleted. This can't be undone.</p>
          <p className="hint">To keep the record, change its status to closed instead.</p>
          {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
          <div className="form-actions">
            <button type="button" className="button" onClick={closeModal} disabled={deleting}>Cancel</button>
            <button type="button" className="button button-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
