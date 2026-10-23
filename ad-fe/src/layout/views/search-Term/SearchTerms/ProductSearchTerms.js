import React, { useMemo } from "react";
import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { PermissionCheck } from "../../../../helper/permission/PermissionCheck";
import { AgGridReact } from "ag-grid-react";
import { CustomNoRowsOverlay } from "../../../../common/grid/AgTable";
import { t } from "i18next";
import CurrencyCode from "../../../../helper/currencyCode/CurrencyCode";
import CurrencyFormat from "../../../../helper/currencyCode/CurrencyFormat";
import { Card, CardContent } from "../../../../components/ui/card";
import { CampaignNameCell } from "../../../../utility/campaignNavigation";

const ProductSearchTerms = ({ data, asin, onSelectionChanged }) => {
  const rowData = useMemo(() => {
    if (!data) return [];
    const flattened = [];
    data.forEach((campaign) => {
      if (campaign.searchTerms && campaign.searchTerms.length > 0) {
        campaign.searchTerms.forEach((st) => {
          flattened.push({
            ...st,
            guid: st.guid || `${campaign.campaignId}_${st.adGroupId}_${st.keywordId || ""}_${st.searchTerm}`,
            campaignId: campaign.campaignId,
            campaignName: campaign.campaignName,
            campaignStatus: campaign.campaignStatus,
          });
        });
      }
    });
    return flattened;
  }, [data]);

  const columnDefs = useMemo(
    () => [
      ...(PermissionCheck(SYSTEM_PAGES.SEARCH_TERM, PAGE_ACTIONS.UPDATE) ? [{
        headerName: "",
        field: "checkbox",
        checkboxSelection: true,
        headerCheckboxSelection: true,
        maxWidth: 50,
        pinned: "left",
        lockPinned: true,
        suppressMovable: true,
        sortable: false,
        resizable: false,
      }] : []),
      {
        headerName: t("Campaign Name"),
        field: "campaignName",
        minWidth: 350,
        flex: 1.5,
        cellRenderer: (p) => {
          const row = p.data;
          if (!row) return null;
          return (
            <CampaignNameCell
              row={row}
              name={row.campaignName}
              campaignId={row.campaignId}
              showStatusDot={true}
            />
          );
        },
      },
      {
        headerName: t("searchTerm"),
        field: "searchTerm",
        minWidth: 150,
      },
      {
        headerName: t("targeting"),
        field: "targeting",
        minWidth: 120,
      },
      {
        headerName: t("keywordType"),
        field: "keywordType",
        minWidth: 100,
      },
      {
        headerName: t("Status"),
        field: "existTargeting",
        minWidth: 150,
        cellRenderer: (params) => {
          const statusData = params.value || {};
          const pillBase = {
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: "3px 9px",
            borderRadius: "20px",
            fontSize: "11px",
            fontWeight: 600,
            border: "1px solid",
            lineHeight: "1.5",
            whiteSpace: "nowrap",
          };

          if (!statusData.isExist || !statusData.list?.length) {
            return (
              <span
                style={{
                  ...pillBase,
                  letterSpacing: "0.6px",
                  background: "linear-gradient(135deg, #1A9FD4, #0566c3)",
                  color: "#fff",
                  textTransform: "uppercase",
                }}
              >
                ✦ New
              </span>
            );
          }

          const config = {
            ENABLED: {
              EXACT: { label: "⚡ Exact", bg: "#e6f4ea", color: "#166534", border: "#86efac", dot: "#22c55e" },
              PHRASE: { label: "💬 Phrase", bg: "#e6f4ea", color: "#166534", border: "#86efac", dot: "#22c55e" },
              BROAD: { label: "🌐 Broad", bg: "#e6f4ea", color: "#166534", border: "#86efac", dot: "#22c55e" },
              TARGETING_EXPRESSION: { label: "🎯 Product", bg: "#e6f4ea", color: "#166534", border: "#86efac", dot: "#22c55e" },
            },
            PAUSED: {
              EXACT: { label: "⚡ Exact", bg: "#f1f5f9", color: "#64748b", border: "#cbd5e1", dot: "#94a3b8" },
              PHRASE: { label: "💬 Phrase", bg: "#f1f5f9", color: "#64748b", border: "#cbd5e1", dot: "#94a3b8" },
              BROAD: { label: "🌐 Broad", bg: "#f1f5f9", color: "#64748b", border: "#cbd5e1", dot: "#94a3b8" },
              TARGETING_EXPRESSION: { label: "🎯 Product", bg: "#f1f5f9", color: "#64748b", border: "#cbd5e1", dot: "#94a3b8" },
            },
            ARCHIVED: {
              EXACT: { label: "⚡ Exact", bg: "#fef2f2", color: "#991b1b", border: "#fecaca", dot: "#ef4444" },
              PHRASE: { label: "💬 Phrase", bg: "#fef2f2", color: "#991b1b", border: "#fecaca", dot: "#ef4444" },
              BROAD: { label: "🌐 Broad", bg: "#fef2f2", color: "#991b1b", border: "#fecaca", dot: "#ef4444" },
              TARGETING_EXPRESSION: { label: "🎯 Product", bg: "#fef2f2", color: "#991b1b", border: "#fecaca", dot: "#ef4444" },
            },
          };

          const fallback = { label: "—", bg: "#f1f5f9", color: "#64748b", border: "#cbd5e1", dot: "#94a3b8" };

          return (
            <div className="flex flex-row gap-1 flex-wrap" style={{ padding: "5px 0" }}>
              {statusData.list.map((item, idx) => {
                const status = item.status || "";
                const type = item.keywordType || item.type || "";
                const style = config[status]?.[type] ?? fallback;
                return (
                  <span key={idx} style={{ ...pillBase, background: style.bg, color: style.color, borderColor: style.border }}>
                    <span
                      style={{
                        width: "5px",
                        height: "5px",
                        borderRadius: "50%",
                        background: style.dot,
                        display: "inline-block",
                        flexShrink: 0,
                      }}
                    />
                    {style.label}
                  </span>
                );
              })}
            </div>
          );
        },
      },
      {
        headerName: t("impressions"),
        field: "impressions",
        minWidth: 100,
        cellRenderer: (p) => CurrencyFormat(p.value ?? 0),
      },
      {
        headerName: t("clicks"),
        field: "clicks",
        minWidth: 90,
        cellRenderer: (p) => CurrencyFormat(p.value ?? 0),
      },
      {
        headerName: t("spend"),
        field: "spend",
        minWidth: 100,
        cellRenderer: (p) => CurrencyCode(p.value),
      },
      {
        headerName: t("Orders"),
        field: "orders",
        minWidth: 90,
        cellRenderer: (p) => CurrencyFormat(p.value ?? 0),
      },
      {
        headerName: t("sales"),
        field: "sales",
        minWidth: 110,
        cellRenderer: (p) => CurrencyCode(p.value),
      },
      {
        headerName: t("acos"),
        field: "acos",
        minWidth: 90,
        cellRenderer: (p) => (p.value !== undefined ? `${p.value}%` : "N/A"),
      },
      {
        headerName: t("roas"),
        field: "roas",
        minWidth: 90,
      },
      {
        headerName: t("cpc"),
        field: "cpc",
        minWidth: 90,
        cellRenderer: (p) => CurrencyCode(p.value),
      },
      {
        headerName: t("ctr"),
        field: "ctr",
        minWidth: 90,
        cellRenderer: (p) => (p.value !== undefined ? `${p.value}%` : "N/A"),
      },
    ],
    []
  );

  const defaultColDef = useMemo(
    () => ({
      sortable: true,
      resizable: true,
      suppressMovable: false,
    }),
    []
  );

  return (
    <Card className="border border-slate-100 dark:border-white/5 bg-[#f8fafc]/50 dark:bg-white/[0.02] shadow-none rounded-xl overflow-hidden p-0">
      <CardContent className="p-0">
        <div className="ag-theme-alpine iq-ag-table" id="search-term-inner-table" style={{ width: "100%", height: "250px" }}>
          <AgGridReact
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            sortingOrder={["asc", "desc"]}
            rowSelection="multiple"
            onSelectionChanged={(event) => {
              const selected = event.api.getSelectedRows();
              onSelectionChanged?.(asin, selected);
            }}
            suppressRowClickSelection={true}
            suppressCellFocus={true}
            rowHeight={40}
            headerHeight={40}
            suppressHorizontalScroll={false}
            domLayout="normal"
            noRowsOverlayComponent={CustomNoRowsOverlay}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default ProductSearchTerms;
