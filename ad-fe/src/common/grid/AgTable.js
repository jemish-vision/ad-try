import React, { forwardRef, useRef, useCallback, useEffect, useState, useContext, useMemo, useImperativeHandle } from "react";
import { useTranslation } from "react-i18next";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { ApiListGetColumns, ApiListUpdateColumns } from "../../api-wrapper/columns/ApiColumns";
import { ProfileContext } from "../../helper/usecontext/useContext";
import CustomizeColumns from "../../helper/modal/CustomizeColumns";

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100];

export const CustomLoadingOverlay = () => {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="flex flex-col items-center gap-2 p-4 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
        <i className="fa-solid fa-circle-notch fa-spin text-2xl text-[#1A9FD4]" />
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Loading data...</span>
      </div>
    </div>
  );
};

export const CustomNoRowsOverlay = () => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in zoom-in-95 duration-200">
      <div className="ag-empty-3d-graphic mb-4">
        <div className="ag-empty-scene">
          <div className="empty-glass-card empty-card-1">
            <div className="empty-card-grid">
              <div className="grid-line"></div>
              <div className="grid-line"></div>
              <div className="grid-line"></div>
            </div>
          </div>
          <div className="empty-glass-card empty-card-2">
            <div className="chart-bar-mock"></div>
            <div className="chart-bar-mock"></div>
          </div>
          <div className="empty-scene-glow"></div>
        </div>
      </div>
      <h3 className="font-semibold text-slate-700 dark:text-slate-300 text-[14px] mb-1">
        {t("No records found")}
      </h3>
      <p className="text-[12px] text-slate-500 dark:text-slate-400 max-w-[240px] leading-normal">
        {t("There are no matching rows or data to display right now.")}
      </p>
    </div>
  );
};

const GRID_ICONS = {
  sortAscending: '<i class="fa-solid fa-arrow-up custom-sort-icon"></i>',
  sortDescending: '<i class="fa-solid fa-arrow-down custom-sort-icon"></i>',
  sortUnSort: '<i class="fa-solid fa-sort custom-sort-icon"></i>',
};

const GRID_SIDEBAR = {
  toolPanels: [{
    id: "columns",
    labelDefault: "Columns",
    labelKey: "columns",
    iconKey: "columns",
    toolPanel: "agColumnsToolPanel",
    toolPanelParams: {
      suppressRowGroups: true,
      suppressValues: true,
      suppressPivotMode: true,
    },
  }],
};

const SORTING_ORDER = ["asc", "desc"];

const AgTable = forwardRef(function AgTable(
  {
    rowData = [],
    columnDefs = [],
    pinnedBottomRowData,
    totalRecords = 0,
    perPage = 25,
    currentPage = 1,
    onPageChange,
    onPerPageChange,
    onSortChanged,
    onColumnMoved,
    onColumnResized,
    onColumnVisible,
    rowHeight = 44,

    // ── Master/Detail (legacy — kept for non-campaign pages) ──────────────
    detailCellRenderer,
    detailCellRendererParams,
    isRowMaster,
    detailRowAutoHeight,

    // ── Tree Data props ───────────────────────────────────────────────────
    treeData = false,
    getDataPath,
    autoGroupColumnDef,
    groupDefaultExpanded = 0,

    showPagination = true,
    paginationOptions = DEFAULT_PAGE_SIZES,
    tableId = "iq-ag-table",
    height = "calc(100vh - 420px)",
    minHeight = "400px",
    defaultColDef: externalDefaultColDef,
    handleSaveColumns,
    isCustomSaveColumns = false,
    customSaveColumnName,
    loading = false,
    isLoading = false,
    onRefresh,
    enableCustomizeColumns = true,
    ...rest
  },
  ref
) {
  const { t, i18n } = useTranslation();
  const { profileId: profile, profileData, selectedAdType } = useContext(ProfileContext);
  const profileId = profile?.value ?? profileData?.profiles?.[0]?.profileId;

  const totalPages = Math.ceil(totalRecords / perPage) || 1;
  const startRecord = totalRecords === 0 ? 0 : (currentPage - 1) * perPage + 1;
  const endRecord = Math.min(currentPage * perPage, totalRecords);
  const isGridLoading = Boolean(loading || isLoading);

  const savePageName = customSaveColumnName || (tableId && tableId !== "iq-ag-table" ? tableId : null);


  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const internalGridRef = useRef(null);
  const expandedRowIdsRef = useRef(new Set());
  const gridWrapperRef = useRef(null);
  const [savedCols, setSavedCols] = useState(null);

  const isResizingRef = useRef(false);

  // ✅ Store latest values in refs — avoids stale closures without re-creating callbacks
  const columnDefsRef = useRef(columnDefs);
  const handleSaveColumnsRef = useRef(handleSaveColumns);
  columnDefsRef.current = columnDefs;
  handleSaveColumnsRef.current = handleSaveColumns;

  const gridApiInstanceRef = useRef(null);
  const lastAppliedStateRef = useRef("");

  // Expose methods to parent via forwardRef
  useImperativeHandle(ref, () => {
    const internal = internalGridRef.current;
    return {
      get api() {
        return gridApiInstanceRef.current || internal?.api;
      },
      get columnApi() {
        return gridApiInstanceRef.current?.columnApi || internal?.columnApi;
      },
      openCustomizeColumns: () => setShowCustomizeModal(true),
      ...(internal || {}),
    };
  }, []);

  // ── Normalize Column Definitions ──────────────────────────────────────────
  const normalizedColumnDefs = useMemo(() => {
    return (columnDefs ?? []).map((col, index) => {
      const isInternal = Boolean(
        col._isInternal ||
        col.field === "expand" ||
        col.field === "checkbox" ||
        col.field === "_checkbox" ||
        col.colId === "expand" ||
        col.colId === "checkbox" ||
        col.colId === "_checkbox" ||
        col.cellRenderer === "agGroupCellRenderer" ||
        col.checkboxSelection === true ||
        (!col.headerName && !col.title && (col.field === "campaignId" || col.field === "targetId" || col.field === "guid" || col.field === "adGroupId" || col.maxWidth <= 50))
      );
      const title = isInternal
        ? ""
        : (col.title ||
          (typeof col.headerName === "string" && col.headerName.trim()
            ? col.headerName
            : col.headerComponentParams?.title
              ? `${col.headerComponentParams.title}${col.headerComponentParams.subLabel ? ` (${col.headerComponentParams.subLabel})` : ""}`
              : (col.field ? col.field : "")));

      return {
        ...col,
        colId: col.colId || col.field || `col_${index}`,
        title: isInternal ? (col.title || "") : (title || col.title),
        _isInternal: isInternal,
        _originalIndex: index,
        ...(isInternal ? { order: index - 100, hide: false } : {}),
      };
    });
  }, [columnDefs]);

  // If parent explicitly updates column ordering/visibility (e.g. via its own CustomizeColumns modal)
  // or if dynamic column IDs change (e.g. date buckets in ProductPerformance or tabs in WarehouseDetails),
  // clear local savedCols override when no persistent savePageName is configured.
  const parentOrderSig = useMemo(
    () => (columnDefs ?? []).map((c, idx) => `${c.colId || c.title || c.field || idx}:${c.headerName || ""}:${c.order ?? ""}:${Boolean(c.hide)}`).join("|"),
    [columnDefs]
  );
  const prevParentOrderSigRef = useRef(parentOrderSig);
  useEffect(() => {
    if (prevParentOrderSigRef.current !== parentOrderSig) {
      prevParentOrderSigRef.current = parentOrderSig;
      if (
        !savePageName ||
        (columnDefs ?? []).some((c) => !c._isInternal && c.order !== undefined && c.order !== 9999)
      ) {
        setSavedCols(null);
      }
    }
  }, [parentOrderSig, columnDefs, savePageName]);

  const customColumnDefs = useMemo(() => {
    if (!savedCols || !savedCols.length) {
      return normalizedColumnDefs;
    }
    return normalizedColumnDefs.map((col, index) => {
      if (col._isInternal) {
        return { ...col, _isInternal: true, order: index - 100, hide: false };
      }
      const fallbackOrder = (col.order !== undefined && col.order !== 9999) ? col.order : (index + 1);
      const matched = savedCols.find(
        (sc) => (sc.title && sc.title === col.title) || (col.field && sc.field && sc.field === col.field)
      );
      if (matched) {
        return {
          ...col,
          order: (matched.order !== undefined && matched.order !== 9999) ? matched.order : fallbackOrder,
          hide: matched.isDisplay === false,
          ...(matched.width ? { width: matched.width, flex: null } : {}),
        };
      }
      return {
        ...col,
        order: fallbackOrder,
      };
    });
  }, [normalizedColumnDefs, savedCols]);

  // Modal available columns: all non-internal columns that have a title
  const modalAllColumns = useMemo(() => {
    return normalizedColumnDefs
      .filter((col) => !col._isInternal && col.title)
      .map((col) => ({
        title: col.title,
        headerName: col.headerName || col.title,
        field: col.field,
        order: col.order,
        hide: col.hide,
        isDefault: Boolean(col.isDefault || col.lockVisible),
      }));
  }, [normalizedColumnDefs]);

  // Default columns that cannot be hidden in the modal
  const derivedDefaultColumns = useMemo(() => {
    return normalizedColumnDefs
      .filter((col) => !col._isInternal && (col.isDefault || col.lockVisible || (col.pinned === "left" && (col.title === "Action" || col.field === "action"))))
      .map((col) => col.title);
  }, [normalizedColumnDefs]);

  // Columns currently selected and ordered for the modal
  const selectedColumnsForModal = useMemo(() => {
    const active = customColumnDefs.length ? customColumnDefs : normalizedColumnDefs;
    return active
      .filter((c) => !c._isInternal && !c.hide && c.title)
      .map((c) => ({
        title: c.title,
        isDisplay: true,
        order: c.order,
      }))
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  }, [customColumnDefs, normalizedColumnDefs]);

  // ── Apply Column Ordering & Visibility strictly to AG-Grid ────────────────
  const applyGridColumnOrdering = useCallback((activeCols) => {
    const api = gridApiInstanceRef.current || (typeof ref === "object" && ref?.current?.api);
    if (!api || typeof api.applyColumnState !== "function" || !activeCols?.length) return;

    // 1. Internal pinned columns (expand, select checkbox) ALWAYS FIRST in original order
    const internalCols = activeCols
      .filter((c) => c._isInternal)
      .sort((a, b) => (a._originalIndex ?? 0) - (b._originalIndex ?? 0));

    // 2. Visible user columns sorted strictly by order ascending
    const userVisibleCols = activeCols
      .filter((c) => !c._isInternal && !c.hide)
      .sort((a, b) => ((a.order ?? 999) - (b.order ?? 999)) || ((a._originalIndex ?? 0) - (b._originalIndex ?? 0)));

    // 3. Hidden columns placed at the end
    const hiddenCols = activeCols
      .filter((c) => !c._isInternal && c.hide)
      .sort((a, b) => ((a.order ?? 999) - (b.order ?? 999)) || ((a._originalIndex ?? 0) - (b._originalIndex ?? 0)));

    const orderedState = [
      ...internalCols,
      ...userVisibleCols,
      ...hiddenCols,
    ].map((col) => {
      const colId = col.colId || col.field;
      return {
        colId,
        hide: col._isInternal ? false : Boolean(col.hide),
        ...(col.width ? { width: col.width } : {}),
        ...(col.pinned ? { pinned: col.pinned } : {}),
      };
    }).filter((s) => s.colId);

    if (orderedState.length) {
      api.applyColumnState({
        state: orderedState,
        applyOrder: true,
      });
    }
  }, [ref]);

  // ── Fetch Custom Columns from API on mount ───────────────────────────────
  useEffect(() => {
    const fetchCustomColumns = async () => {
      if (!savePageName) return;
      try {
        const body = { pageName: savePageName };
        const response = await ApiListGetColumns(body);

        if (response?.isSuccess && response?.data && response?.data?.columns?.length) {
          setSavedCols(response.data.columns);
        }
      } catch (err) {
        console.error("[AgTable] Failed to fetch custom columns:", err);
      }
    };

    if (savePageName && normalizedColumnDefs.length > 0) {
      fetchCustomColumns();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savePageName, profileId, selectedAdType, normalizedColumnDefs.length]);

  // ── Handle Column Save from CustomizeColumns modal ────────────────────────
  const handleModalSaveColumns = async (newColumns) => {
    const fullSaved = normalizedColumnDefs
      .filter((col) => !col._isInternal && col.title)
      .map((col, index) => {
        const matched = newColumns.find((nc) => nc.title === col.title || (col.field && nc.field === col.field));
        if (matched) {
          return {
            title: col.title,
            field: col.field,
            order: matched.order ?? (index + 1),
            isDisplay: Boolean(matched.isDisplay),
            ...(matched.width ? { width: matched.width } : {}),
          };
        }
        return {
          title: col.title,
          field: col.field,
          order: 9999,
          isDisplay: false,
        };
      });

    setSavedCols(fullSaved);

    if (typeof handleSaveColumnsRef.current === "function") {
      handleSaveColumnsRef.current(newColumns);
    }

    if (savePageName) {
      try {
        await ApiListUpdateColumns({
          pageName: savePageName,
          columns: newColumns,
        });
      } catch (err) {
        console.error("[AgTable] Failed to save custom columns:", err);
      }
    }
  };

  // Re-apply state on columnDefs change
  useEffect(() => {
    const active = customColumnDefs.length ? customColumnDefs : normalizedColumnDefs;
    if (active.length && gridApiInstanceRef.current) {
      applyGridColumnOrdering(active);
      if (typeof gridApiInstanceRef.current.refreshHeader === "function") {
        gridApiInstanceRef.current.refreshHeader();
      }
      if (typeof gridApiInstanceRef.current.refreshCells === "function") {
        gridApiInstanceRef.current.refreshCells({ force: true });
      }
    }
  }, [normalizedColumnDefs, customColumnDefs, applyGridColumnOrdering]);

  useEffect(() => {
    const api = gridApiInstanceRef.current || (typeof ref === "object" && ref?.current?.api);
    if (api && typeof api.refreshHeader === "function") {
      api.refreshHeader();
    }
  }, [i18n?.language, ref]);

  useEffect(() => {
    const api = gridApiInstanceRef.current || (typeof ref === "object" && ref?.current?.api);
    if (!api) return;
    if (isGridLoading) {
      if (typeof api.showLoadingOverlay === "function") api.showLoadingOverlay();
    } else {
      if (rowData && rowData.length > 0) {
        if (typeof api.hideOverlay === "function") api.hideOverlay();
      } else {
        if (typeof api.showNoRowsOverlay === "function") api.showNoRowsOverlay();
      }
    }
  }, [isGridLoading, rowData, ref]);

  const defaultColDef = React.useMemo(() => ({
    sortable: true,
    resizable: true,
    minWidth: 80,
    suppressMenu: false,
    headerValueGetter: (params) => {
      const title = params?.colDef?.headerName || params?.colDef?.title;
      return title ? t(title) : "";
    },
    ...externalDefaultColDef,
  }), [externalDefaultColDef, t]);

  const getRowClass = useCallback(({ rowIndex, data }) => {
    if (data?.isTotalRow) return "";
    return rowIndex % 2 === 0 ? "ag-row-even" : "ag-row-odd";
  }, []);

  const restoreExpandedNodes = useCallback(() => {
    if (!treeData) return;
    const api = gridApiInstanceRef.current || (typeof ref === "object" && ref?.current?.api);
    if (!api || expandedRowIdsRef.current.size === 0) return;

    api.forEachNode((node) => {
      if (node.group && expandedRowIdsRef.current.has(node.id) && !node.expanded) {
        node.setExpanded(true);
      }
    });
  }, [treeData, ref]);

  const handleRowGroupOpened = useCallback((params) => {
    if (!treeData) return;
    const { node } = params;
    if (node.expanded) {
      expandedRowIdsRef.current.add(node.id);
    } else {
      expandedRowIdsRef.current.delete(node.id);
    }
  }, [treeData]);

  const handleRowDataUpdated = useCallback(() => {
    restoreExpandedNodes();
  }, [restoreExpandedNodes]);

  const handleFirstDataRendered = useCallback(() => {
    restoreExpandedNodes();
  }, [restoreExpandedNodes]);

  // ── Column save helpers for drag / resize on grid ─────────────────────────
  const handleColumnSaved = useCallback(() => {
    const api = gridApiInstanceRef.current || (typeof ref === "object" && ref?.current?.api);
    if (!api) return;

    const columnState = api.getColumnState();
    const updatedColumns = columnState
      .map((col) => {
        const matched = normalizedColumnDefs.find((c) => (c.colId || c.field) === col.colId);
        if (matched?._isInternal) return null;
        return {
          title: matched?.title || col.colId,
          field: matched?.field || col.colId,
          isDisplay: !col.hide,
          width: col.width,
        };
      })
      .filter(Boolean)
      .map((col, index) => ({
        ...col,
        order: index + 1,
      }));

    setSavedCols(updatedColumns);

    if (typeof handleSaveColumnsRef.current === "function") {
      handleSaveColumnsRef.current(updatedColumns);
    }

    if (savePageName) {
      ApiListUpdateColumns({
        pageName: savePageName,
        columns: updatedColumns,
      }).catch((err) => console.error("[AgTable] Failed to update column widths/positions:", err));
    }
  }, [normalizedColumnDefs, savePageName, ref]);

  const handleColumnResizeStart = useCallback(() => {
    isResizingRef.current = true;
  }, []);

  const handleColumnResized = useCallback((params) => {
    if (params.finished && isResizingRef.current) {
      isResizingRef.current = false;
      handleColumnSaved();
    }
  }, [handleColumnSaved]);

  const handleDragStopped = useCallback(() => {
    if (!isResizingRef.current) {
      handleColumnSaved();
    }
    isResizingRef.current = false;
  }, [handleColumnSaved]);

  // ── Horizontal scrolling on Shift + Mouse Wheel ──────────────────────────
  useEffect(() => {
    const el = gridWrapperRef.current;
    if (!el) return;

    let target = null;
    const handleWheel = (e) => {
      if (!e.shiftKey || e.deltaY === 0) return;
      if (!target || !el.contains(target)) {
        target =
          el.querySelector(".ag-center-cols-viewport") ||
          el.querySelector(".ag-body-viewport") ||
          el.querySelector(".ag-body-horizontal-scroll-viewport");
      }
      if (target) {
        target.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
    };
  }, []);

  const activeColumnDefsToPass = useMemo(() => {
    const activeCols = customColumnDefs.length ? customColumnDefs : normalizedColumnDefs;
    const internalCols = activeCols
      .filter((c) => c._isInternal)
      .sort((a, b) => (a._originalIndex ?? 0) - (b._originalIndex ?? 0));
    const userVisibleCols = activeCols
      .filter((c) => !c._isInternal && !c.hide)
      .sort((a, b) => ((a.order ?? 999) - (b.order ?? 999)) || ((a._originalIndex ?? 0) - (b._originalIndex ?? 0)));
    const hiddenCols = activeCols
      .filter((c) => !c._isInternal && c.hide)
      .sort((a, b) => ((a.order ?? 999) - (b.order ?? 999)) || ((a._originalIndex ?? 0) - (b._originalIndex ?? 0)));
    return [...internalCols, ...userVisibleCols, ...hiddenCols];
  }, [customColumnDefs, normalizedColumnDefs]);

  return (
    <div id={tableId} className="glass-grid-container flex flex-col w-full max-w-full relative h-full flex-1 min-h-0">
      {isGridLoading && (
        <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-[2px] flex items-center justify-center z-[100] transition-all duration-200 rounded-lg pointer-events-auto">
          <div className="flex flex-col items-center gap-2 p-4 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
            <i className="fa-solid fa-circle-notch fa-spin text-2xl text-[#1A9FD4]" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t("Loading data...")}</span>
          </div>
        </div>
      )}

      {/* Floating customize columns button when pagination is hidden */}
      {!showPagination && enableCustomizeColumns && (
        <div className="absolute top-2 right-2 z-10">
          <button
            type="button"
            className="iq-pag-btn shadow-sm bg-white/90 dark:bg-slate-800/90 backdrop-blur border border-slate-200 dark:border-slate-700"
            onClick={() => setShowCustomizeModal(true)}
            title={t("Customize Columns")}
          >
            <i className="fa-solid fa-table-columns" />
          </button>
        </div>
      )}

      <div
        ref={gridWrapperRef}
        className="iq-ag-table ag-theme-alpine"
        style={{
          width: "100%",
          height,
          minHeight,
          overflowX: "hidden",
          overflowY: "hidden",
          transform: "translateZ(0)",
          WebkitTransform: "translateZ(0)",
        }}
      >
        <AgGridReact
          ref={internalGridRef}
          onGridReady={(params) => {
            gridApiInstanceRef.current = params.api;
            const activeDefs = customColumnDefs.length ? customColumnDefs : normalizedColumnDefs;
            if (activeDefs?.length) {
              applyGridColumnOrdering(activeDefs);
            }
            if (typeof rest.onGridReady === "function") {
              rest.onGridReady(params);
            }
          }}
          rowData={rowData}
          columnDefs={activeColumnDefsToPass}
          defaultColDef={defaultColDef}
          sortingOrder={SORTING_ORDER}
          pinnedBottomRowData={pinnedBottomRowData}

          // ── Tree Data ───────────────────────────────────────────────────
          treeData={treeData}
          getDataPath={treeData ? getDataPath : undefined}
          autoGroupColumnDef={treeData ? autoGroupColumnDef : undefined}
          groupDefaultExpanded={treeData ? groupDefaultExpanded : undefined}

          // ── Tree expand state persistence ───────────────────────────────
          onRowGroupOpened={handleRowGroupOpened}
          onRowDataUpdated={handleRowDataUpdated}
          onFirstDataRendered={handleFirstDataRendered}

          // ── Master/Detail (legacy — kept for other pages) ───────────────
          masterDetail={!treeData && !!detailCellRenderer}
          detailCellRenderer={!treeData ? detailCellRenderer : undefined}
          detailCellRendererParams={!treeData ? detailCellRendererParams : undefined}
          isRowMaster={!treeData ? isRowMaster : undefined}
          detailRowAutoHeight={!treeData ? detailRowAutoHeight : undefined}

          // ── Sort ────────────────────────────────────────────────────────
          onSortChanged={onSortChanged}
          icons={GRID_ICONS}

          // ── Column state ────────────────────────────────────────────────
          onColumnMoved={onColumnMoved}
          onColumnResizeStarted={handleColumnResizeStart}
          onColumnResized={handleColumnResized}
          onDragStopped={handleDragStopped}
          onColumnVisible={onColumnVisible}

          // ── Text Selection ──────────────────────────────────────────────
          enableCellTextSelection={true}

          // ── Tooltip ─────────────────────────────────────────────────────
          tooltipShowDelay={500}
          tooltipHideDelay={3000}

          // ── Custom Overlays ─────────────────────────────────────────────
          loadingOverlayComponent={CustomLoadingOverlay}
          noRowsOverlayComponent={CustomNoRowsOverlay}
          suppressNoRowsOverlay={isGridLoading}

          // ── Styling & High Performance Scrolling ────────────────────────
          getRowClass={getRowClass}
          rowHeight={rowHeight}
          headerHeight={48}
          animateRows={false}
          suppressPaginationPanel={true}

          suppressColumnMoveAnimation={false}
          suppressAnimationFrame={false}
          suppressDragLeaveHidesColumns={true}
          rowBuffer={10}
          suppressColumnVirtualisation={false}
          suppressRowVirtualisation={false}

          // Column sidebar
          sideBar={GRID_SIDEBAR}

          {...rest}
        />
      </div>

      {/* ── Pagination bar ── */}
      {showPagination && (
        <div className="iq-pagination">
          <div className="iq-pagination-left">
            <span>{t("Rows per page:")}</span>
            <select
              value={perPage}
              onChange={(e) => onPerPageChange?.(Number(e.target.value))}
            >
              {paginationOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            {totalRecords > 0 && (
              <span className="iq-showing-records-text" style={{ color: "#94a3b8", fontSize: 12 }}>
                {t("Showing")} {startRecord}–{endRecord} {t("of")}{" "}
                <strong style={{ color: "var(--text-primary, #1A9FD4)" }}>
                  {totalRecords.toLocaleString()}
                </strong>
              </span>
            )}
          </div>

          <div className="iq-pagination-right">
            <span className="iq-pag-info">{t("Page")}</span>
            <span className="iq-pag-page-badge">{currentPage}</span>
            <span className="iq-pag-info">{t("of")} <strong>{totalPages}</strong></span>
            <div className="iq-pag-controls">
              <button className="iq-pag-btn" disabled={currentPage <= 1} onClick={() => onPageChange?.(1)} title={t("First page")}>
                <i className="fa-solid fa-angles-left" />
              </button>
              <button className="iq-pag-btn" disabled={currentPage <= 1} onClick={() => onPageChange?.(currentPage - 1)} title={t("Previous page")}>
                <i className="fa-solid fa-angle-left" />
              </button>
              <button className="iq-pag-btn" disabled={currentPage >= totalPages} onClick={() => onPageChange?.(currentPage + 1)} title={t("Next page")}>
                <i className="fa-solid fa-angle-right" />
              </button>
              <button className="iq-pag-btn" disabled={currentPage >= totalPages} onClick={() => onPageChange?.(totalPages)} title={t("Last page")}>
                <i className="fa-solid fa-angles-right" />
              </button>
            </div>
            <div className="iq-pag-controls" style={{ marginLeft: "8px" }}>
              <button
                className="iq-pag-btn"
                onClick={() => {
                  if (onRefresh) onRefresh();
                  else if (rest.onRefresh) rest.onRefresh();
                  else onPageChange?.(currentPage);
                }}
                title={t("Refresh Grid")}
              >
                <i className="fa-solid fa-rotate-right" />
              </button>
            </div>
            {enableCustomizeColumns && (
              <div className="iq-pag-controls" style={{ marginLeft: "4px" }}>
                <button
                  type="button"
                  className="iq-pag-btn"
                  onClick={() => setShowCustomizeModal(true)}
                  title={t("Customize Columns")}
                >
                  <i className="fa-solid fa-table-columns" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Built-in Universal Customize Columns Modal ── */}
      {enableCustomizeColumns && (
        <CustomizeColumns
          showModal={showCustomizeModal}
          setShowModal={setShowCustomizeModal}
          allColumns={modalAllColumns}
          selectedColumn={selectedColumnsForModal}
          defaultColumns={derivedDefaultColumns}
          handler={handleModalSaveColumns}
        />
      )}
    </div>
  );
});

export default AgTable;