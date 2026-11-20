import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { testSuitesApi } from '../api.js';
import { formatDate, suiteDeleteMessage } from '../format.js';
import AddCasesPanel from '../components/AddCasesPanel.jsx';
import Modal from '../components/Modal.jsx';
import SortableCaseList from '../components/SortableCaseList.jsx';
import TestSuiteForm from '../components/TestSuiteForm.jsx';

export default function TestSuiteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [suite, setSuite] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  // modal: null | 'edit' | 'delete' | 'add-cases'
  const [modal, setModal] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const closeModal = useCallback(() => {
    setModal(null);
    setDeleteError('');
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSuite(null);
    setLoadError('');
    testSuitesApi
      .get(id)
      .then((data) => !cancelled && setSuite(data))
      .catch((err) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Runs a change against the server and shows the suite it sends back.
  const run = async (action) => {
    setBusy(true);
    setActionError('');
    try {
      setSuite(await action());
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleReorder = (reordered) => {
    const previous = suite;
    setSuite({ ...suite, cases: reordered }); // show the new order straight away
    run(() => testSuitesApi.reorder(suite.id, reordered.map((c) => c.id))).then(() => {
      // If saving failed, run() has shown the error; put the old order back.
      setSuite((current) => (current.cases === reordered ? previous : current));
    });
  };

  const handleRemove = (testCase) => run(() => testSuitesApi.removeCase(suite.id, testCase.id));

  const handleAdd = async (testCase) => {
    setSuite(await testSuitesApi.addCase(suite.id, testCase.id));
  };

  const handleSave = async (values) => {
    setSuite(await testSuitesApi.update(suite.id, values));
    closeModal();
  };

  const handleDelete = async () => {
    try {
      await testSuitesApi.remove(suite.id);
      navigate('/test-suites');
    } catch (err) {
      setDeleteError(err.message);
    }
  };

  if (loadError) {
    return (
      <main className="page">
        <p><Link to="/test-suites">← Test suites</Link></p>
        <h1>{loadError === 'Test suite not found' ? 'Test suite not found' : "Couldn't load this test suite"}</h1>
        <p>{loadError === 'Test suite not found' ? 'It may have been deleted.' : loadError}</p>
      </main>
    );
  }

  if (!suite) {
    return <main className="page"><p>Loading…</p></main>;
  }

  return (
    <main className="page">
      <p className="back-link"><Link to="/test-suites">← Test suites</Link></p>

      <div className="page-header">
        <h1>{suite.name}</h1>
        <div className="header-actions">
          <button type="button" className="button" onClick={() => setModal('edit')}>✎ Edit</button>
          <button type="button" className="button button-danger-outline" onClick={() => setModal('delete')}>🗑 Delete</button>
        </div>
      </div>

      <dl className="suite-meta">
        <div><dt>Feature</dt><dd>{suite.feature}</dd></div>
        <div><dt>Status</dt><dd><span className={`status-text status-${suite.status}`}>{suite.status}</span></dd></div>
        <div><dt>Test cases</dt><dd>{suite.cases.length}</dd></div>
        <div><dt>Updated</dt><dd>{formatDate(suite.updatedAt)}</dd></div>
      </dl>

      <div className="section-header">
        <h2>Test cases in order</h2>
        <button type="button" className="button button-primary" onClick={() => setModal('add-cases')}>
          + Add test cases
        </button>
      </div>

      {actionError && <p className="form-error" role="alert">{actionError}</p>}

      {suite.cases.length > 0 ? (
        <>
          <p className="hint">
            Drag ⠿ to change the order. With a keyboard: Tab to ⠿, press Space, use the arrow keys, then press Space again.
          </p>
          <SortableCaseList cases={suite.cases} onReorder={handleReorder} onRemove={handleRemove} busy={busy} />
        </>
      ) : (
        <div className="table-wrap empty empty-panel">No test cases in this suite yet. Click “+ Add test cases” to add some.</div>
      )}

      {modal === 'edit' && (
        <Modal title="Edit test suite" onClose={closeModal}>
          <TestSuiteForm initial={suite} onSubmit={handleSave} onCancel={closeModal} />
        </Modal>
      )}

      {modal === 'add-cases' && (
        <Modal title="Add test cases" onClose={closeModal}>
          <AddCasesPanel inSuiteIds={suite.cases.map((c) => c.id)} onAdd={handleAdd} onDone={closeModal} />
        </Modal>
      )}

      {modal === 'delete' && (
        <Modal title="Delete test suite?" onClose={closeModal}>
          <p>{suiteDeleteMessage(suite.name, suite.cases.length)}</p>
          {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
          <div className="form-actions">
            <button type="button" className="button" onClick={closeModal}>Cancel</button>
            <button type="button" className="button button-danger" onClick={handleDelete}>Delete</button>
          </div>
        </Modal>
      )}
    </main>
  );
}
