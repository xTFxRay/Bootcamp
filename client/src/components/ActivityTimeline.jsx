import { formatDate } from '../format.js';

const StatusName = ({ status }) => <span className={`status-text status-${status}`}>{status}</span>;

// A bug's history, oldest first: when it was reported, every status change, and every comment.
export default function ActivityTimeline({ activity }) {
  if (activity.length === 0) return <p className="muted">No activity yet.</p>;

  return (
    <ol className="timeline">
      {activity.map((item) => (
        <li key={item.id} className={`timeline-item timeline-${item.action}`}>
          <div className="timeline-head">
            <span className="timeline-what">
              {item.action === 'created' && <>Bug reported as <StatusName status={item.newValue} /></>}
              {item.action === 'status_change' && (
                <>
                  Status changed from <StatusName status={item.oldValue} /> to <StatusName status={item.newValue} />
                </>
              )}
              {item.action === 'comment' && 'Comment'}
            </span>
            <time className="timeline-when" dateTime={item.timestamp}>{formatDate(item.timestamp)}</time>
          </div>
          {item.message && <p className="timeline-message">{item.message}</p>}
        </li>
      ))}
    </ol>
  );
}
