import { useTranslation } from "react-i18next";
import { t } from "i18next";
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import AgTable from "../../../common/grid/AgTable";
import { Eye, XCircle } from "lucide-react";
import { Buffer } from "buffer";

import Toast from "../../../common/helper/toast/Toast";
import Filter from "../../../helper/filter/Filter";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import { ApiCloseSupportTicket, ApiSupportTicketList } from "../../../api-wrapper/ApiSupportTicket";
import { MdOutlineClose } from "react-icons/md";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { Input } from "../../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";



const SupportTicket = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [perPage, setPerPage] = useState(firstPageRows);
  const [ticketList, setTicketList] = useState([]);
  const [meta, setMeta] = useState({});
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [closeTicketModal, setCloseTicketModal] = useState(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const gridRef = useRef(null);
  const [loadingGrid, setLoadingGrid] = useState(false);

  const ApiListing = async (extra = {}) => {
    setLoadingGrid(true);
    const payload = {
      pageNo: arg.pageNo,
      perPage: arg.perPage,
      search,
      status,
      fieldName: "createdAt",
      sortType: "DESC",
      ...extra
    };

    try {
      const res = await ApiSupportTicketList(payload, true);
      if (res?.isSuccess) {
        setTicketList(res.data);
        setMeta(res);
      } else Toast.error(res.message);
    } catch {
      Toast.error(t("Something went wrong"));
    } finally {
      setLoadingGrid(false);
    }
  };

  useEffect(() => {
    ApiListing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 350);
    return () => clearTimeout(handler);
  }, [search]);

  useEffect(() => {
    if (debouncedSearch !== undefined) {
      ApiListing({ search: debouncedSearch });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const handleCloseTicket = async () => {
    if (!closeTicketModal) return;

    try {
      const res = await ApiCloseSupportTicket({ ticketId: closeTicketModal._id });

      if (res?.isSuccess) {
        Toast.success(res.message);
        ApiListing();
      } else {
        Toast.error(res.message);
      }
    } catch {
      Toast.error(t("Something went wrong"));
    } finally {
      setCloseTicketModal(null);
    }
  };

  const handlePageChange = (page) => {
    setArg((prev) => ({ ...prev, pageNo: page }));
    ApiListing({ pageNo: page });
  };

  const handlePerRowsChange = (newPerPage) => {
    setPerPage(newPerPage);
    setArg({ pageNo: 1, perPage: newPerPage });
    ApiListing({ pageNo: 1, perPage: newPerPage });
  };

  const handleSortChanged = (e) => {
    const sortModel = e.columns;
    if (!sortModel || sortModel.length === 0) return;
    const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];
    ApiListing({ fieldName: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }), ...arg });
  };

  const columns = [
    {
      headerName: t("Action"),
      field: "action",
      title: "Action",
      width: 120,
      sortable: false,
      resizable: false,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div className="flex gap-2 items-center">
            <Eye
              className="h-4.5 w-4.5 cursor-pointer text-sky-500 hover:text-sky-600 transition-colors"
              title={t("View Ticket")}
              onClick={() => navigate(`/support-ticket/${Buffer.from(JSON.stringify({ ticketId: row._id })).toString("base64")}`)}
            />
            {row.status !== "closed" && (
              <XCircle
                className="h-4.5 w-4.5 cursor-pointer text-red-500 hover:text-red-600 transition-colors"
                title={t("Close Ticket")}
                onClick={() => setCloseTicketModal(row)}
              />
            )}
          </div>
        );
      },
    },
    {
      headerName: t("User Name"),
      field: "userName",
      title: "User Name",
      minWidth: 160,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
    },
    {
      headerName: t("Email"),
      field: "userEmail",
      title: "Email",
      minWidth: 200,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
    },
    {
      headerName: t("Status"),
      field: "status",
      title: "Status",
      width: 130,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        if (!params.value) return null;
        const val = params.value.toLowerCase();
        let badgeClass = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
        if (val === "open") {
          badgeClass = "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400";
        } else if (val === "pending") {
          badgeClass = "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
        }
        return (
          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${badgeClass}`}>
            {params.value.toUpperCase()}
          </span>
        );
      },
    },
    {
      headerName: t("Created At"),
      field: "createdAt",
      title: "Created At",
      minWidth: 180,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{params.value ? new Date(params.value).toLocaleString() : "-"}</>,
    },
    {
      headerName: t("Updated At"),
      field: "updatedAt",
      title: "Updated At",
      minWidth: 180,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{params.value ? new Date(params.value).toLocaleString() : "-"}</>,
    },
  ];

  return (
    <>
      <Filter
        name={"Support Ticket"}
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />

      <div className="middle_container">
        <div className="glass-grid-container overflow-hidden">
          {/* HEADER + FILTERS */}
          <div className={`data_model_btn camapgin_btn flex-wrap flex ${isMobile ? "flex-col" : "flex-row"} items-center justify-between gap-3 p-3`}>
            <div className={`flex items-center ${isMobile ? "w-full justify-between" : ""}`}>
              <h5 className="m-0 font-bold">{t("Support Tickets")}</h5>
            </div>

            <div className={`flex ${isMobile ? "flex-col w-full" : "flex-row items-center"} gap-2`}>
              <div className={`flex ${isMobile ? "flex-row flex-wrap w-full" : "flex-row items-center"} gap-2`}>
                <div id="support-ticket-search" className="relative flex items-center" style={{ width: isMobile ? "100%" : "220px" }}>
                  <Input
                    type="text"
                    placeholder={t("searchHere")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="shadcn-search-input pr-8 text-xs h-9 w-full"
                  />
                  {search && (
                    <MdOutlineClose
                      onClick={() => setSearch("")}
                      className="absolute right-2.5 cursor-pointer opacity-70 hover:opacity-100 dark:text-slate-300"
                      style={{ fontSize: "16px" }}
                    />
                  )}
                </div>

                <div id="support-ticket-status" className="fil m-0">
                  <Select
                    value={status}
                    onValueChange={(value) => {
                      setStatus(value);
                      ApiListing({ status: value });
                    }}
                  >
                    <SelectTrigger style={{ height: "40px", minWidth: isMobile ? "100%" : "150px" }}>
                      <SelectValue placeholder={t("All Status")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{t("All Status")}</SelectItem>
                      <SelectItem value="open">{t("Open")}</SelectItem>
                      <SelectItem value="pending">{t("Pending")}</SelectItem>
                      <SelectItem value="closed">{t("Closed")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          <div className="data_table" style={{ padding: "0 14px 14px 14px" }}>
            <AgTable
              onRefresh={ApiListing} ref={gridRef}
              tableId="supportTicket-main-table"
              height={"60vh"}
              loading={loadingGrid}
              rowData={ticketList}
              columnDefs={columns}
              totalRecords={meta?.totalRecords ?? 0}
              perPage={perPage}
              currentPage={arg.pageNo}
              onPageChange={handlePageChange}
              onPerPageChange={handlePerRowsChange}
              onSortChanged={handleSortChanged}
              paginationOptions={paginationRowsPerPageOptions}
              isCustomSaveColumns={true}
              customSaveColumnName={"Support Tickets"}
              handleSaveColumns={undefined}
            />
          </div>
        </div>
      </div>

      <CustomModal
        show={!!closeTicketModal?._id}
        onHide={() => setCloseTicketModal(null)}
        title={t("Close Ticket")}
        icon="cancel"
        iconVariant="danger"
        message={`Are you sure you want to close this ticket?`}
        actions={[
          { label: t("Cancel"), onClick: () => setCloseTicketModal(null), cancel: true },
          { label: t("Close Ticket"), onClick: handleCloseTicket, variant: "danger", icon: "cancel" }
        ]}
      />
    </>
  );
};

export default SupportTicket;
