const CATEGORY_ICONS = {
  coffee:    '☕',
  groceries: '🛒',
  utilities: '⚡',
  transport: '🚗',
  dining:    '🍽️',
  shopping:  '🛍️',
  transfer:  '💸',
  bills:     '📄',
  all:       '📊',
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function TransactionsTable({ data, onClose }) {
  if (!data) return null;

  const { transactions = [], category = 'all', total_spend = 0, year, count = 0 } = data;

  const catKey    = (category || 'all').toLowerCase();
  const icon      = CATEGORY_ICONS[catKey] || '📋';
  const catLabel  = catKey === 'all'
    ? 'All Categories'
    : catKey.charAt(0).toUpperCase() + catKey.slice(1);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.icon}>{icon}</span>
          <div>
            <div style={styles.title}>
              {catLabel} &middot; {year}
            </div>
            <div style={styles.subtitle}>
              {count} transaction{count !== 1 ? 's' : ''} &nbsp;·&nbsp; €{total_spend.toFixed(2)} total
            </div>
          </div>
        </div>
        <button style={styles.closeBtn} onClick={onClose} title="Dismiss">✕</button>
      </div>

      {/* Table */}
      {transactions.length === 0 ? (
        <p style={styles.empty}>No transactions found.</p>
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Merchant</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((txn, i) => (
                <tr key={i} style={i % 2 === 0 ? styles.rowEven : styles.rowOdd}>
                  <td style={styles.tdDate}>{formatDate(txn.date)}</td>
                  <td style={styles.td}>{txn.merchant}</td>
                  <td style={styles.tdAmount}>
                    −€{Math.abs(txn.amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    margin: '0 24px 0',
    borderRadius: '14px',
    background: '#FFFFFF',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    overflow: 'hidden',
    flexShrink: 0,
    animation: 'slideDown 0.2s ease',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: '#F0F4FA',
    borderBottom: '1px solid #E2E8F0',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  icon: {
    fontSize: '22px',
  },
  title: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#003D7A',
  },
  subtitle: {
    fontSize: '11px',
    color: '#5A6478',
    marginTop: '1px',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '14px',
    color: '#9AA5B4',
    cursor: 'pointer',
    padding: '4px 6px',
    borderRadius: '6px',
    lineHeight: 1,
  },
  tableWrapper: {
    overflowX: 'auto',
    maxHeight: '220px',
    overflowY: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    padding: '8px 14px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: '600',
    color: '#5A6478',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #E2E8F0',
    background: '#FAFBFD',
    position: 'sticky',
    top: 0,
  },
  rowEven: {
    background: '#FFFFFF',
  },
  rowOdd: {
    background: '#F7F9FC',
  },
  td: {
    padding: '8px 14px',
    color: '#1A1A2E',
    borderBottom: '1px solid #F0F4FA',
  },
  tdDate: {
    padding: '8px 14px',
    color: '#5A6478',
    borderBottom: '1px solid #F0F4FA',
    whiteSpace: 'nowrap',
    fontSize: '12px',
  },
  tdAmount: {
    padding: '8px 14px',
    textAlign: 'right',
    color: '#EF4444',
    fontWeight: '600',
    borderBottom: '1px solid #F0F4FA',
    whiteSpace: 'nowrap',
  },
  empty: {
    padding: '16px',
    fontSize: '13px',
    color: '#9AA5B4',
    textAlign: 'center',
  },
};
