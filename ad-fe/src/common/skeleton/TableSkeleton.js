import React from "react";

// Native Tailwind pulse skeleton to replace @mui/material/Skeleton dependency
const Skeleton = ({ className = "", width, height, style = {} }) => {
  return (
    <div
      className={`animate-pulse rounded bg-slate-200/50 dark:bg-slate-700/40 ${className}`}
      style={{
        width: typeof width === "number" ? `${width}px` : width || "100%",
        height: typeof height === "number" ? `${height}px` : height || "16px",
        ...style
      }}
    />
  );
};

/**
 * A high-fidelity table skeleton component designed to match the AG Grid structure.
 */
const TableSkeleton = ({
  columns = 7,
  rows = 5,
  height = "70vh",
  headerHeight = "48px",
  rowHeight = 120,
  showPagination = true
}) => {
  // Determine if columns is an array or a number
  const colCount = Array.isArray(columns) ? columns.length : columns;
  const colArray = Array.isArray(columns) ? columns : [...Array(columns)];

  return (
    <div className="rounded-t overflow-hidden flex flex-col" style={{ height, background: "var(--glass-bg)", border: "var(--glass-border)" }}>
      {/* 🔹 Generic Skeleton Header */}
      <div
        className="flex items-center font-bold"
        style={{
          height: headerHeight,
          background: "var(--table-header-bg)",
          borderBottom: "var(--glass-border)",
          flexShrink: 0
        }}
      >
        {colArray.map((col, idx) => (
          <div
            key={idx}
            className="px-3"
            style={{
              width: col?.width || (idx === 1 ? 'auto' : '150px'),
              flexGrow: idx === 1 ? 1 : 0,
              minWidth: col?.minWidth || (idx === 1 ? '400px' : 'auto')
            }}
          >
            <Skeleton width="60%" height="16px" />
          </div>
        ))}
      </div>

      {/* 🔹 Skeleton Rows Container */}
      <div className="grow overflow-hidden" style={{ background: "transparent" }}>
        {[...Array(rows)].map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="flex items-start"
            style={{ height: `${rowHeight}px`, overflow: 'hidden', borderBottom: 'var(--glass-border)', background: 'transparent' }}
          >
            {colArray.map((col, colIndex) => (
              <div
                key={colIndex}
                className="p-3 h-full flex flex-col justify-center"
                style={{
                  width: col?.width || (colIndex === 1 ? 'auto' : '150px'),
                  flexGrow: colIndex === 1 ? 1 : 0,
                  minWidth: col?.minWidth || (colIndex === 1 ? '400px' : 'auto'),
                  borderRight: colIndex < colCount - 1 ? "var(--glass-border)" : "none"
                }}
              >
                {colIndex === 1 ? (
                  // Main Content Column (mimicking image + multi-line text)
                  <div className="flex gap-3 items-center">
                    <Skeleton width={80} height={80} className="rounded-lg shrink-0" />
                    <div className="grow flex flex-col gap-2">
                      <Skeleton width="90%" height={20} />
                      <Skeleton width="60%" height={16} />
                      <Skeleton width="40%" height={14} />
                    </div>
                  </div>
                ) : (
                  // Generic Column
                  <div className="flex flex-col gap-2">
                    <Skeleton width="80%" height="18px" />
                    <Skeleton width="50%" height="16px" />
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* 🔹 Skeleton Pagination Footer */}
      {showPagination && (
        <div
          className="flex items-center justify-between px-3"
          style={{ height: "55px", flexShrink: 0, borderTop: "var(--glass-border)", background: "transparent" }}
        >
          <div className="flex items-center gap-3">
            <Skeleton width={100} height={20} />
            <Skeleton width={60} height={30} className="rounded" />
            <Skeleton width={120} height={20} />
          </div>
          <div className="flex items-center gap-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} width={32} height={32} className="rounded" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TableSkeleton;
