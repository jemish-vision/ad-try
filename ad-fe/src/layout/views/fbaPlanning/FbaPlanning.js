import React, { useState, useEffect, useContext, useRef } from 'react';
import { useTranslation } from "react-i18next";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import useSpConnection from "../../../helper/hooks/useSpConnection";
import SpAccountNotConnected from "../../../common/components/SpAccountNotConnected";
import Filter from "../../../helper/filter/Filter";
import { ApiGetFbaPlanningCards, ApiGetFbaPlanningGraph, ApiGetFbaPlanningGrid } from "../../../api-wrapper/inventoryManagement/ApiInventoryManagement";
import FbaPlanningCards from "./FbaPlanningCards";
import FbaPlanningCharts from "./FbaPlanningCharts";
import FbaPlanningGrid from "./FbaPlanningGrid";
import Toast from "../../../common/helper/toast/Toast";
import moment from "moment";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import { Input } from "../../../components/ui/input";
import { FiSearch } from "react-icons/fi";
import { MdOutlineClose } from "react-icons/md";
import "./FbaPlanning.css";

const FbaPlanning = () => {
  const { t } = useTranslation();
  const { profileId, selectedAdType, selectedDate, setSelectedDate } = useContext(ProfileContext);
  const { isConnected: isSpConnected, isLoaded: isSpLoaded } = useSpConnection();

  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const [date, setDate] = useState([moment().subtract(30, 'days').toDate(), new Date()]);

  useEffect(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      setDate([moment(selectedDate[0]).toDate(), moment(selectedDate[1]).toDate()]);
    } else {
      let storeData;
      try {
        storeData = JSON.parse(localStorage.getItem('profile'));
      } catch (err) {}
      if (storeData?.date && Array.isArray(storeData.date) && storeData.date.length >= 2) {
        setSelectedDate(storeData.date);
      } else {
        const firstDate = moment().startOf("month").format("YYYY-MM-DD");
        const lastDate = moment().format("YYYY-MM-DD");
        setSelectedDate([firstDate, lastDate]);
      }
    }
  }, [selectedDate, setSelectedDate]);

  const handleDateChange = (val) => {
    setDate(val);
    if (val && Array.isArray(val) && val.length >= 2) {
      const arr = [moment(val[0]).format("YYYY-MM-DD"), moment(val[1]).format("YYYY-MM-DD")];
      setSelectedDate(arr);
      try {
        let storeData = JSON.parse(localStorage.getItem('profile')) || {};
        storeData.date = arr;
        localStorage.setItem('profile', JSON.stringify(storeData));
      } catch (err) {}
    }
  };
  const [searchSku, setSearchSku] = useState("");
  const [debouncedSearchSku, setDebouncedSearchSku] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchSku(searchSku);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchSku]);

  const [selectedStatus, setSelectedStatus] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Cards & Graphs State
  const [cardData, setCardData] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [loadingCards, setLoadingCards] = useState(true);
  const [loadingGraph, setLoadingGraph] = useState(true);

  // Grid State
  const [gridData, setGridData] = useState([]);
  const [totalGridRecords, setTotalGridRecords] = useState(0);
  const [loadingGrid, setLoadingGrid] = useState(true);
  const [gridPage, setGridPage] = useState(1);
  const [gridPerPage, setGridPerPage] = useState(25);
  const [sortCol, setSortCol] = useState("availableInventory");
  const [sortOrder, setSortOrder] = useState("desc");

  const statusOptions = [
    { label: t("All"), value: null },
    { label: t("URGENT"), value: "URGENT" },
    { label: t("PLAN_SHIPMENT"), value: "PLAN_SHIPMENT" },
    { label: t("OVERSTOCK"), value: "OVERSTOCK" },
    { label: t("HEALTHY"), value: "HEALTHY" },
    { label: t("NO SALES"), value: "NO_SALES" }
  ];

  const lastFetchCardsParamsRef = useRef("");
  const lastFetchGraphParamsRef = useRef("");

  // Load Cards Data
  const fetchCards = async () => {
    if (!profileId?.value) return;
    if (isSpLoaded && !isSpConnected) {
      setCardData(null);
      setLoadingCards(false);
      return;
    }

    setLoadingCards(true);
    const payload = {
      profileId: profileId.value,
      fromDate: moment(date[0]).format("YYYY-MM-DD"),
      toDate: moment(date[1]).format("YYYY-MM-DD")
    };

    const requestSignature = JSON.stringify(payload);
    if (lastFetchCardsParamsRef.current === requestSignature) {
      setLoadingCards(false);
      return;
    }
    lastFetchCardsParamsRef.current = requestSignature;

    try {
      const res = await ApiGetFbaPlanningCards(payload);
      if (res?.isSuccess) {
        setCardData(res.data);
      }
    } catch (error) {
      console.error("FBA Cards Error:", error);
    } finally {
      setLoadingCards(false);
    }
  };

  // Load Graph Data
  const fetchGraph = async () => {
    if (!profileId?.value) return;
    if (isSpLoaded && !isSpConnected) {
      setGraphData(null);
      setLoadingGraph(false);
      return;
    }

    setLoadingGraph(true);
    const payload = {
      profileId: profileId.value,
      fromDate: moment(date[0]).format("YYYY-MM-DD"),
      toDate: moment(date[1]).format("YYYY-MM-DD"),
      search: debouncedSearchSku,
    };

    const requestSignature = JSON.stringify(payload);
    if (lastFetchGraphParamsRef.current === requestSignature) {
      setLoadingGraph(false);
      return;
    }
    lastFetchGraphParamsRef.current = requestSignature;

    try {
      const res = await ApiGetFbaPlanningGraph(payload);
      if (res?.isSuccess) {
        setGraphData(res.data);
      }
    } catch (error) {
      console.error("FBA Graph Error:", error);
    } finally {
      setLoadingGraph(false);
    }
  };

  const lastFetchGridParamsRef = useRef("");

  // Load Grid Data
  const fetchGrid = async (page = gridPage, perPage = gridPerPage, col = sortCol, order = sortOrder, isReload = false) => {
    if (!profileId?.value) return;
    if (isSpLoaded && !isSpConnected) {
      setGridData([]);
      setTotalGridRecords(0);
      setLoadingGrid(false);
      return;
    }

    const payload = {
      profileId: profileId.value,
      page: page,
      limit: perPage,
      sort: col,
      order: order === "desc" ? -1 : 1,
      fromDate: moment(date[0]).format("YYYY-MM-DD"),
      toDate: moment(date[1]).format("YYYY-MM-DD"),
      search: debouncedSearchSku || "",
      status: selectedStatus || ""
    };

    const requestSignature = JSON.stringify(payload);
    if (!isReload && lastFetchGridParamsRef.current === requestSignature) {
      return;
    }

    lastFetchGridParamsRef.current = requestSignature;
    setLoadingGrid(true);

    try {
      const res = await ApiGetFbaPlanningGrid(payload);
      if (res?.isSuccess) {
        setGridData(res.data || []);
        setTotalGridRecords(res.totalCount || 0);
        setGridPage(page);
      }
    } catch (error) {
      console.error("FBA Grid Error:", error);
    } finally {
      setLoadingGrid(false);
    }
  };

  useEffect(() => {
    lastFetchGridParamsRef.current = "";
    lastFetchCardsParamsRef.current = "";
    lastFetchGraphParamsRef.current = "";
  }, [profileId?.value]);

  useEffect(() => {
    fetchCards();
  }, [profileId?.value, selectedAdType, date]);

  // Re-fetch Graph & Grid on filter changes
  useEffect(() => {
    fetchGraph();
    fetchGrid(1);
  }, [profileId?.value, selectedAdType, date, debouncedSearchSku, selectedStatus]);

  const handleGridSort = (e) => {
    const columnState = e.api.getColumnState();
    const sortedColumn = columnState.find((s) => s.sort !== null);
    if (sortedColumn) {
      const { colId, sort } = sortedColumn;
      setSortCol(colId);
      setSortOrder(sort);
      fetchGrid(gridPage, gridPerPage, colId, sort);
    } else {
      setSortCol(null);
      setSortOrder(null);
      fetchGrid(gridPage, gridPerPage, null, null);
    }
  };

  return (
    <div className="fba-planning-container">
      <Filter
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />

      <div className="middle_container">
        {/* Sticky Filter Bar */}
        <div
          className="glass-sticky-header dash-filter-bar sticky-top"
          style={{
            padding: isMobile ? "10px 16px" : "10px 24px",
            zIndex: 90,
            top: 0,
            marginLeft: 0,
            marginRight: 0,
            marginTop: "-10px",
            marginBottom: "20px",
            width: "100%"
          }}
        >
          <div className="flex flex-wrap items-center gap-[12px] w-full">
            {/* Uniform Date Range Picker */}
            <div id="fba-date-picker" style={{ flex: isMobile ? "1 1 100%" : "0 0 240px", width: isMobile ? "100%" : "240px" }}>
              <DateRangePicker
                className="w-full"
                style={{ width: "100%", height: "40px" }}
                ranges={predefinedRanges}
                 value={date}
                placeholder={t("Select Date")}
                onChange={handleDateChange}
                placement="bottomStart"
                format="yyyy-MM-dd"
                cleanable={false}
              />
            </div>

            {/* Right-aligned search group */}
            <div style={{ display: "flex", marginLeft: isMobile ? "0" : "auto", justifyContent: isMobile ? "flex-start" : "flex-end", flex: isMobile ? "1 1 100%" : "1 1 auto", width: isMobile ? "100%" : "auto" }}>
              {/* Uniform Search Box */}
              <div
                id="fba-search"
                className="search_option m-0 flex items-center relative"
                style={{
                  flex: isMobile ? "1 1 100%" : "1 1 260px",
                  maxWidth: isMobile ? "100%" : "280px",
                  height: "40px",
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "#e2e8f0"}`,
                  background: isDark ? "rgba(255, 255, 255, 0.04)" : "#F1F5F9",
                  borderRadius: 6,
                  paddingLeft: 12
                }}
              >
                <Input
                  type="text"
                  placeholder={t("Search By SKU, ASIN...")}
                  value={searchSku}
                  onChange={(e) => setSearchSku(e.target.value)}
                  className="flex-grow w-full h-[40px] border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent shadow-none px-0"
                  style={{ paddingRight: searchSku ? "30px" : "10px" }}
                />
                {searchSku && (
                  <MdOutlineClose
                    onClick={() => setSearchSku("")}
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
            </div>
          </div>
        </div>

        {/* Content Section */}
        {!isSpConnected && isSpLoaded ? (
          <SpAccountNotConnected feature={t("FBA Planning")} isDark={isDark} />
        ) : (
          <>
            {/* Summary Section */}
            <div id="fba-cards">
              <FbaPlanningCards
                data={cardData}
                loading={loadingCards}
                selectedStatus={selectedStatus}
                onStatusChange={setSelectedStatus}
                isDark={isDark}
              />
            </div>

            {/* Charts Section */}
            <div id="fba-charts">
              <FbaPlanningCharts
                data={graphData}
                loading={loadingGraph}
                isDark={isDark}
                isMobile={isMobile}
              />
            </div>

            {/* Grid Section */}
            <FbaPlanningGrid
              rowData={gridData}
              totalRecords={totalGridRecords}
              loading={loadingGrid}
              currentPage={gridPage}
              rowsPerPage={gridPerPage}
              onPageChange={(p) => fetchGrid(p)}
              onPerPageChange={(pp) => fetchGrid(1, pp)}
              onSortChanged={handleGridSort}
              selectedStatus={selectedStatus}
              setSelectedStatus={setSelectedStatus}
              statusOptions={statusOptions}
              isDark={isDark}
              refreshData={(mode = 'all') => {
                if (mode === 'all') {
                  fetchCards();
                  fetchGraph();
                }
                fetchGrid(1, gridPerPage, sortCol, sortOrder, true); // Always refresh grid to first page
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default FbaPlanning;
