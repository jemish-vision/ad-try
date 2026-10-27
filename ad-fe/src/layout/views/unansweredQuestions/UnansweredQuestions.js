import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiUnansweredQuestions, ApiUnansweredQuestionProfiles } from "../../../api-wrapper/ApiUnansweredQuestions";
import { ROLES } from "../../../common/constants";
import Filter from "../../../helper/filter/Filter";
import AgTable from "../../../common/grid/AgTable";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Check, ChevronDown, Search, Loader2 } from "lucide-react";
import "./UnansweredQuestions.css";

const INITIAL_QUERY = {
  page: 1,
  pageSize: 10,
  search: "",
  profileId: "",
  sortBy: "lastAskedAt",
  sortOrder: "desc"
};

export default function UnansweredQuestions() {
  const { t } = useTranslation();
  const authorized = localStorage.getItem("role") === ROLES.SUPER_ADMIN;
  const [query, setQuery] = useState(INITIAL_QUERY);
  const [search, setSearch] = useState("");
  const [result, setResult] = useState({
    data: [],
    totalRecords: 0,
    totalPages: 0
  });

  // Profile filter state (searchable + on-scroll pagination)
  const [profiles, setProfiles] = useState([]);
  const [profileSearch, setProfileSearch] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [selectedProfileName, setSelectedProfileName] = useState("");
  const [profilePage, setProfilePage] = useState(1);
  const [profileHasMore, setProfileHasMore] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileLoadingMore, setProfileLoadingMore] = useState(false);
  const profileSearchDebounce = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  // Debounced search for questions
  useEffect(() => {
    const timer = setTimeout(() => setQuery(old => old.search === search.trim() ? old : {
      ...old,
      search: search.trim(),
      page: 1
    }), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Load unanswered questions
  useEffect(() => {
    if (!authorized) {
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");
    const params = Object.fromEntries(Object.entries(query).filter(([, value]) => value !== ""));
    ApiUnansweredQuestions(params, controller.signal).then(response => {
      if (!active) return;
      if (!response?.isSuccess) throw new Error(response?.message || t("Unable to load unanswered questions."));
      if (query.page > Math.max(response.totalPages || 0, 1)) {
        setQuery(old => ({
          ...old,
          page: Math.max(response.totalPages || 0, 1)
        }));
        return;
      }
      setResult(response);
    }).catch(failure => {
      if (active) setError(failure.response?.data?.message || failure.message || t("Unable to load unanswered questions."));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [query, refresh, authorized, t]);

  // Load profiles with search and page 1
  useEffect(() => {
    if (!authorized) return;
    if (profileSearchDebounce.current) clearTimeout(profileSearchDebounce.current);
    profileSearchDebounce.current = setTimeout(() => {
      setProfileLoading(true);
      ApiUnansweredQuestionProfiles({ search: profileSearch.trim(), page: 1, pageSize: 20 })
        .then(res => {
          if (res?.isSuccess) {
            setProfiles(res.data || []);
            setProfilePage(1);
            setProfileHasMore(Boolean(res.hasMore));
          }
        })
        .catch(() => {})
        .finally(() => setProfileLoading(false));
    }, 300);
    return () => clearTimeout(profileSearchDebounce.current);
  }, [profileSearch, authorized]);

  // Handle on-scroll pagination in profile dropdown
  const handleProfileScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 25) {
      if (profileHasMore && !profileLoading && !profileLoadingMore) {
        setProfileLoadingMore(true);
        const nextPage = profilePage + 1;
        ApiUnansweredQuestionProfiles({ search: profileSearch.trim(), page: nextPage, pageSize: 20 })
          .then(res => {
            if (res?.isSuccess && Array.isArray(res.data)) {
              setProfiles(prev => {
                const existing = new Set(prev.map(p => p.profileId));
                const newItems = res.data.filter(p => !existing.has(p.profileId));
                return [...prev, ...newItems];
              });
              setProfilePage(nextPage);
              setProfileHasMore(Boolean(res.hasMore));
            }
          })
          .catch(() => {})
          .finally(() => setProfileLoadingMore(false));
      }
    }
  };

  const handleSelectProfile = (profileId, profileName) => {
    updateFilter("profileId", profileId);
    setSelectedProfileName(profileId ? profileName : "");
    setProfileOpen(false);
  };

  const updateFilter = (field, value) => setQuery(old => ({
    ...old,
    [field]: value,
    page: 1
  }));

  const clearFilters = () => {
    setSearch("");
    setProfileSearch("");
    setSelectedProfileName("");
    setQuery({
      ...INITIAL_QUERY,
      pageSize: query.pageSize
    });
  };

  const getReasonLabel = (reason) => {
    const map = {
      unsupported: t("Unsupported request"),
      unanswered: t("Unanswered"),
      error: t("Response error"),
    };
    return map[reason] || reason;
  };

  const columns = useMemo(() => [{
    headerName: t("Question"),
    field: "question",
    title: t("Question"),
    minWidth: 320,
    flex: 2,
    wrapText: true,
    autoHeight: true,
    cellRenderer: ({ data }) => (
      <div>
        {data.question}
        {data.questionTruncated && (
          <span className="uq-truncated" title={t("The original question exceeded the stored length limit")}>
            {t("Truncated")}
          </span>
        )}
      </div>
    )
  }, {
    headerName: t("Profile"),
    field: "profileName",
    title: t("Profile"),
    minWidth: 200,
    flex: 1,
    cellRenderer: ({
      data
    }) => (
      <div className="uq-profile-cell">
        <span>{data.profileName || (data.profileId ? t("Unnamed profile") : t("No profile"))}</span>
        {data.profileId && <small>{data.profileId}</small>}
      </div>
    )
  }, {
    headerName: t("Reason"),
    field: "reason",
    title: t("Reason"),
    minWidth: 170,
    cellRenderer: ({
      value
    }) => <span className={"uq-badge uq-badge-" + value}>{getReasonLabel(value)}</span>
  }, {
    headerName: t("Times asked"),
    field: "count",
    title: t("Times asked"),
    minWidth: 130,
    valueFormatter: ({
      value
    }) => Number(value).toLocaleString()
  }], [t]);

  const total = Number(result.totalRecords) || 0;
  const refreshResults = () => {
    setRefresh(old => old + 1);
  };

  if (!authorized) {
    return (
      <div className="middle_container">
        <p role="alert">{t("Only Super Admin can view chatbot gaps.")}</p>
      </div>
    );
  }

  return <>
    <Filter name={t("Chatbot Gaps")} nameShow={false} dateShow={false} profileShow={false} />
    <div className="middle_container uq-page">
      <div className="glass-grid-container overflow-hidden">
        <div className="data_model_btn camapgin_btn flex flex-wrap items-center justify-between gap-3 p-3">
          <div>
            <h5 className="m-0 font-bold">{t("Chatbot Gaps")}</h5>
            <p className="uq-description">{t("AI-revised unanswered questions grouped by profile, with repeat counts.")}</p>
          </div>
          <Button type="button" variant="outline" className="h-9 text-xs" onClick={refreshResults} disabled={loading}>{t("Refresh")}</Button>
        </div>
        <div className="uq-filters">
          <label className="uq-search" htmlFor="uq-search">
            {t("Search questions")}
            <Input id="uq-search" aria-label={t("Search questions")} type="search" maxLength={200} value={search} placeholder={t("Search question text...")} onChange={e => setSearch(e.target.value)} className="h-9 text-xs" />
          </label>
          <div className="uq-filter-field">
            <label htmlFor="uq-profile">{t("Profile")}</label>
            <Popover open={profileOpen} onOpenChange={setProfileOpen}>
              <PopoverTrigger asChild>
                <button
                  id="uq-profile"
                  type="button"
                  role="combobox"
                  aria-label={t("Profile")}
                  aria-expanded={profileOpen}
                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 hover:bg-accent/30"
                >
                  <span className="truncate text-left">
                    {query.profileId ? (selectedProfileName || query.profileId) : t("All profiles")}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-1.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="uq-profile-popover p-0 shadow-lg"
                align="start"
                sideOffset={4}
                style={{ width: "var(--radix-popover-trigger-width, 240px)" }}
              >
                <div className="uq-profile-search-wrap">
                  <Search className="h-3.5 w-3.5 shrink-0 opacity-50" />
                  <input
                    type="text"
                    className="outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 border-0 shadow-none bg-transparent"
                    style={{ outline: "none", boxShadow: "none", border: "none" }}
                    placeholder={t("Search profile...")}
                    value={profileSearch}
                    onChange={(e) => setProfileSearch(e.target.value)}
                  />
                  {profileLoading && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin opacity-50" />}
                </div>
                <div className="uq-profile-list" onScroll={handleProfileScroll}>
                  <div
                    className={`uq-profile-item ${!query.profileId ? "selected" : ""}`}
                    onClick={() => handleSelectProfile("", t("All profiles"))}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="truncate">{t("All profiles")}</span>
                    </div>
                    {!query.profileId && <Check className="h-3.5 w-3.5 shrink-0 opacity-70 ml-auto" />}
                  </div>
                  {profiles.map((p) => {
                    const isSelected = query.profileId === p.profileId;
                    return (
                      <div
                        key={p.profileId}
                        className={`uq-profile-item ${isSelected ? "selected" : ""}`}
                        onClick={() => handleSelectProfile(p.profileId, p.profileName || p.profileId)}
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          <span className="truncate font-medium leading-snug">{p.profileName || p.profileId}</span>
                          {p.profileId && (
                            <small className="uq-profile-item-id">
                              {p.profileId}
                            </small>
                          )}
                        </div>
                        {isSelected && <Check className="h-3.5 w-3.5 shrink-0 opacity-70 ml-auto" />}
                      </div>
                    );
                  })}
                  {profileLoadingMore && (
                    <div className="flex items-center justify-center p-2 text-[11px] text-muted-foreground">
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> {t("Loading more...")}
                    </div>
                  )}
                  {!profileLoading && profiles.length === 0 && (
                    <div className="p-3 text-center text-xs text-muted-foreground">
                      {t("No profiles found")}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <Button type="button" variant="outline" className="h-9 text-xs" onClick={clearFilters}>{t("Clear filters")}</Button>
        </div>

        {error ? <div role="alert" className="uq-error">{error} <Button type="button" variant="outline" onClick={refreshResults}>{t("Retry")}</Button></div> : null}
        <div id="chatbot-gaps-table" className="data_table" style={{
          padding: "0 14px 14px 14px"
        }}>
          <AgTable tableId="iq-ag-table" theme="legacy" sideBar={false} height="60vh" loading={loading} rowData={error ? [] : result.data || []} columnDefs={columns} defaultColDef={{
            sortable: false,
            filter: false
          }} totalRecords={error ? 0 : total} perPage={query.pageSize} currentPage={query.page} onPageChange={page => {
            if (!loading && !error) setQuery(old => ({
              ...old,
              page
            }));
          }} onPerPageChange={pageSize => updateFilter("pageSize", pageSize)} onRefresh={refreshResults} paginationOptions={[10, 25, 50, 100]} enableCustomizeColumns={false} />
        </div>
      </div>
    </div>
  </>;
}
