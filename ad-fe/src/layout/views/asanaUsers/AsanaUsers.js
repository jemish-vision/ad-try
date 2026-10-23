import { useTranslation } from "react-i18next";
import { t } from "i18next";
import Toast from "../../../common/helper/toast/Toast";
import Filter from "../../../helper/filter/Filter";
import { useEffect, useState, useRef } from "react";
import AgTable from "../../../common/grid/AgTable";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import { ApiAsanaFetchUsers, ApiAsanaUserList, ApiAssignSupportUser } from "../../../api-wrapper/ApiAsanaUsers";
import { MdOutlineClose } from "react-icons/md";

const AsanaUsers = () => {
  const { t } = useTranslation();

  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [perPage, setPerPage] = useState(firstPageRows);

  const [userList, setUserList] = useState([]);
  const [groupsData, setGroupsData] = useState([]);
  const [searchName, setSearchName] = useState("");
  const [debouncedSearchName, setDebouncedSearchName] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [assignUserModal, setAssignUserModal] = useState(null);

  const gridRef = useRef(null);

  const ApiListing = async (extraArgs = {}) => {
    const payload = {
      pageNo: arg.pageNo,
      perPage: arg.perPage,
      searchName: searchName,
      fieldName: 'email',
      sortType: 'DESC',
      ...extraArgs
    };

    await ApiAsanaUserList(payload)
      .then((res) => {
        if (res.isSuccess) {
          setUserList(res.getUsers);
          setGroupsData(res);
        } else {
          Toast.error(res.message);
        }
      })
      .catch(() => {
        Toast.error(t("Something went wrong"));
      });
  };

  useEffect(() => {
    ApiListing();
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchName(searchName);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchName]);

  useEffect(() => {
    if (debouncedSearchName !== undefined) {
      ApiListing({ searchName: debouncedSearchName });
    }
  }, [debouncedSearchName]);

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

  const fetchAsanaUsers = async () => {
    await ApiAsanaFetchUsers()
      .then((res) => {
        if (res?.isSuccess) {
          Toast.success(res?.message);
          ApiListing();
        } else Toast.error(res?.message);
      })
      .catch(() => Toast.error(t("Something went wrong")));
  }

  const assignUserHandler = async () => {
    if (!assignUserModal) return;

    await ApiAssignSupportUser({ userGid: assignUserModal.gid })
      .then((res) => {
        if (res?.isSuccess) {
          Toast.success(res.message);
          ApiListing();
        } else {
          Toast.error(res.message);
        }
      })
      .catch(() => Toast.error(t("Something went wrong")))
      .finally(() => setAssignUserModal(null));
  };

  const getInitials = (name = "") => name.split(" ").map((n) => n[0]).join("").toUpperCase();

  const columns = [
    {
      headerName: t("Action"),
      field: "action",
      title: "Action",
      width: 90,
      sortable: false,
      resizable: false,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div className="action_container gap-2">
            {groupsData?.projectAssignUser?.gid !== row.gid && (
              <i
                className="fa fa-user-check cursor-pointer"
                title={t("Assign Support Tickets")}
                onClick={() => setAssignUserModal(row)}
                style={{ color: isDark ? "#60a5fa" : "" }}
              />
            )}
          </div>
        );
      },
    },
    {
      headerName: "Avatar",
      field: "photo",
      title: "Avatar",
      width: 90,
      sortable: false,
      resizable: false,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return row.photo ? (
          <img
            src={row.photo}
            alt={row.name}
            title={row.name}
            className="rounded-circle object-fit-cover my-2"
            style={{ width: "36px", height: "36px" }}
          />
        ) : (
          <div
            title={row.name}
            className={`rounded-circle flex items-center justify-center fw-semibold my-2 ${isDark ? "bg-dark text-light border border-secondary" : "bg-secondary bg-opacity-25 text-secondary"}`}
            style={{ width: "36px", height: "36px", fontSize: "14px" }}
          >
            {getInitials(row.name)}
          </div>
        );
      },
    },
    {
      headerName: "Name",
      field: "name",
      title: "Name",
      flex: 1,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
    },
    {
      headerName: "Email",
      field: "email",
      title: "Email",
      flex: 1,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
    },
  ];

  return (
    <>
      <Filter
        name={"Asana Users"}
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />
      <div className="middle_container budget_container">
        <div className="glass-grid-container overflow-hidden">
          <div className={`data_model_btn camapgin_btn flex-wrap flex ${isMobile ? "flex-col" : "flex-row"} items-center justify-between gap-3 p-3`} style={{
            padding: "12px 24px",
            borderBottom: isDark ? "1px solid #334155" : "none",
            backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "transparent"
          }}>
            <div className={`flex items-center ${isMobile ? "w-full justify-between" : ""}`}>
              <h5 className="m-0 font-bold" style={{ color: isDark ? "#f8fafc" : "#1e293b" }}>{t("Asana Users")}</h5>
            </div>

            <div className={`flex ${isMobile ? "flex-col w-full" : "flex-row items-center"} gap-2`}>
              <div className={`flex ${isMobile ? "flex-row flex-wrap w-full" : "flex-row items-center"} gap-2`}>
                <div id="asana-users-search" className="search_option m-0" style={{
                  display: "flex",
                  alignItems: "center",
                  position: "relative",
                  width: isMobile ? "100%" : "auto",
                  minWidth: isMobile ? "100%" : "220px",
                  flexGrow: 1,
                  backgroundColor: isDark ? "#1e293b" : "#fff",
                  border: isDark ? "1px solid #334155" : "1px solid #cbd5e1"
                }}>
                  <input
                    type="text"
                    placeholder={t("searchHere")}
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    style={{
                      width: "100%",
                      height: "40px",
                      backgroundColor: "transparent",
                      color: isDark ? "#f8fafc" : "#1e293b",
                      border: "none",
                      paddingRight: searchName ? "30px" : "10px"
                    }}
                  />
                  {searchName && (
                    <MdOutlineClose
                      onClick={() => setSearchName("")}
                      style={{
                        position: "absolute",
                        right: "10px",
                        cursor: "pointer",
                        color: "var(--text-secondary)",
                        fontSize: "18px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: 0.7,
                        transition: "opacity 0.2s"
                      }}
                      onMouseEnter={(e) => e.target.style.opacity = 1}
                      onMouseLeave={(e) => e.target.style.opacity = 0.7}
                    />
                  )}
                </div>

                <button
                  id="asana-users-fetch-btn"
                  className="improve add_btn m-0 gap-0"
                  onClick={fetchAsanaUsers}
                  style={{
                    height: "40px",
                    whiteSpace: "nowrap",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {t("Fetch Users")}
                </button>
              </div>
            </div>
          </div>
          <div className="data_table" style={{ padding: "0 14px 14px 14px" }}>
            <AgTable
              onRefresh={ApiListing} ref={gridRef}
              tableId="asanaUsers-main-table"
              rowData={userList}
              columnDefs={columns}
              totalRecords={groupsData?.totalRecords ?? 0}
              perPage={perPage}
              currentPage={arg.pageNo}
              onPageChange={handlePageChange}
              onPerPageChange={handlePerRowsChange}
              onSortChanged={handleSortChanged}
              paginationOptions={paginationRowsPerPageOptions}
              isCustomSaveColumns={true}
              customSaveColumnName={"Asana Users"}
              handleSaveColumns={undefined}
            />
          </div>
        </div>

        <CustomModal
          show={!!assignUserModal?.gid}
          onHide={() => setAssignUserModal(null)}
          title={t("Assign User")}
          icon="group_work"
          iconVariant="primary"
          message={`${groupsData?.projectAssignUser ? `Reassign support tickets from <b>${groupsData?.projectAssignUser?.name}</b>` : `Assign support tickets`} to <b>${assignUserModal?.name}</b>?`}
          actions={[
            { label: t("Cancel"), onClick: () => setAssignUserModal(null), cancel: true },
            { label: t("Assign"), onClick: assignUserHandler, variant: "primary", icon: "apply" }
          ]}
        />
      </div>
    </>
  );
};

export default AsanaUsers;
