/**
 * Skeleton Loader pour états de chargement fluides
 */

export function Skeleton({ width = '100%', height = '20px', borderRadius = 'var(--radius-sm)', className = '' }) {
  return (
    <div
      className={`ui-skeleton ${className}`}
      style={{
        width,
        height,
        borderRadius,
      }}
    />
  )
}

export function RequestRowSkeleton() {
  return (
    <div className="ui-row-skeleton">
      <Skeleton width="4px" height="42px" borderRadius="2px" />
      <div style={{ flex: '1.2' }}>
        <Skeleton width="130px" height="16px" />
        <Skeleton width="220px" height="13px" style={{ marginTop: 6 }} />
      </div>
      <div style={{ flex: '1.5' }}>
        <Skeleton width="85%" height="15px" />
      </div>
      <div style={{ width: '130px' }}>
        <Skeleton width="100px" height="24px" borderRadius="12px" />
      </div>
      <div style={{ width: '90px' }}>
        <Skeleton width="70px" height="14px" />
      </div>
    </div>
  )
}
