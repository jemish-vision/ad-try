import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "../../../components/ui/dialog";
import { FiFilter } from "react-icons/fi";
import { MdFilterAlt } from "react-icons/md";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { getTagStyles } from "../../../components/recommendation-tags/RecommendationTags";

export const RECOMMENDATION_FILTER_OPTIONS = [
  { label: "Affected Parameter", value: "AffectedParameter", labelKey: "Affected Parameter" },
  { label: "Action", value: "Action", labelKey: "Action" },
  { label: "Tags", value: "Tags", labelKey: "Tags" },
];

export const AFFECTED_PARAMETER_OPTIONS = [
  { value: "Campaign", label: "Campaign" },
  { value: "Placement", label: "Placement" },
  { value: "Targeting", label: "Targeting" },
  { value: "Search Term", label: "Search Term" },
  { value: "Products", label: "Products" },
];

export const ACTION_FILTER_OPTIONS = [
  { value: "SetBudget", label: "Set Budget", scope: "Campaign" },
  { value: "IncreaseBudget", label: "Increase Budget", scope: "Campaign" },
  { value: "DecreaseBudget", label: "Decrease Budget", scope: "Campaign" },
  { value: "CampaignEnable", label: "Enable Campaign", scope: "Campaign" },
  { value: "CampaignPause", label: "Pause Campaign", scope: "Campaign" },
  { value: "IncreaseBid", label: "Increase Bid", scope: "Placement / Targeting" },
  { value: "DecreaseBid", label: "Decrease Bid", scope: "Placement / Targeting" },
  { value: "SetBid", label: "Set Bid", scope: "Placement / Targeting" },
  { value: "EnableTargeting", label: "Enable Targeting", scope: "Targeting" },
  { value: "PauseTargeting", label: "Pause Targeting", scope: "Targeting" },
  { value: "AddAsTargeting", label: "Add as Targeting", scope: "Search Term" },
  { value: "AddAsNegativeTargeting", label: "Add as Negative Targeting", scope: "Search Term" },
  { value: "EnableProduct", label: "Enabled Product", scope: "Products" },
  { value: "DisableProduct", label: "Disabled Product", scope: "Products" },
  { value: "None", label: "None (Out of Budget)", scope: "Out of Budget" },
];

const getColors = (isDark) => ({
  primary: "#1A9FD4",
  primaryRgb: "2, 70, 139",
  primaryLight: isDark ? "rgba(26, 159, 212, 0.15)" : "#E0F4FD",
  neutral50: isDark ? "rgba(255, 255, 255, 0.05)" : "#F8FAFC",
  neutral100: isDark ? "rgba(255, 255, 255, 0.08)" : "#F1F5F9",
  neutral200: isDark ? "rgba(255, 255, 255, 0.1)" : "#E2E8F0",
  neutral400: isDark ? "rgba(255, 255, 255, 0.45)" : "#94A3B8",
  neutral600: isDark ? "rgba(255, 255, 255, 0.65)" : "#475569",
  neutral700: isDark ? "rgba(255, 255, 255, 0.8)" : "#334155",
  neutral800: isDark ? "rgba(255, 255, 255, 0.92)" : "#1E293B",
});

export function buildRecommendationAppliedFilters(appliedGridNames = [], appliedActions = [], t = (k) => k, appliedTagIds = [], tagOptions = []) {
  const filters = [];

  if (appliedGridNames.length > 0) {
    const labels = appliedGridNames.map((v) => {
      const opt = AFFECTED_PARAMETER_OPTIONS.find((o) => o.value === v);
      return t(opt?.label || v);
    });
    filters.push({
      id: "AffectedParameter",
      type: "AffectedParameter",
      value: appliedGridNames,
      displayText: `${t("Affected Parameter")}: ${labels.join(", ")}`,
    });
  }

  if (appliedActions.length > 0) {
    const labels = appliedActions.map((v) => {
      const opt = ACTION_FILTER_OPTIONS.find((o) => o.value === v);
      return t(opt?.label || v);
    });
    filters.push({
      id: "Action",
      type: "Action",
      value: appliedActions,
      displayText: `${t("Action")}: ${labels.join(", ")}`,
    });
  }

  if (appliedTagIds.length > 0) {
    const labels = appliedTagIds.map((id) => tagOptions.find((tg) => String(tg._id) === String(id))?.name || id);
    filters.push({
      id: "Tags",
      type: "Tags",
      value: appliedTagIds,
      displayText: `${t("Tags")}: ${labels.join(", ")}`,
    });
  }

  return filters;
}

const SectionLabel = ({ children, rightAction, P }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
      paddingBottom: 6,
      borderBottom: `1px solid ${P.neutral100}`,
    }}
  >
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        color: P.neutral400,
        textTransform: "uppercase",
        letterSpacing: "0.8px",
      }}
    >
      {children}
    </span>
    {rightAction}
  </div>
);

const CheckItem = ({ checked, onChange, label, badge, P }) => (
  <label
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      padding: "9px 12px",
      borderRadius: 8,
      cursor: "pointer",
      fontSize: 13.5,
      fontWeight: 500,
      color: checked ? P.primary : P.neutral800,
      transition: "all 0.15s",
      border: `1px solid ${checked ? `rgba(${P.primaryRgb}, 0.25)` : "transparent"}`,
      background: checked ? P.primaryLight : "transparent",
      marginBottom: 4,
    }}
    onMouseEnter={(e) => {
      if (!checked) e.currentTarget.style.background = P.neutral50;
    }}
    onMouseLeave={(e) => {
      if (!checked) e.currentTarget.style.background = "transparent";
    }}
  >
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ accentColor: P.primary, width: 15, height: 15, flexShrink: 0, cursor: "pointer" }}
      />
      <span>{label}</span>
    </span>
    {badge && (
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: P.neutral400,
          background: P.neutral100,
          padding: "2px 8px",
          borderRadius: 999,
          flexShrink: 0,
        }}
      >
        {badge}
      </span>
    )}
  </label>
);

export function RecommendationFilterDropdown({
  appliedFilters = [],
  onSelectOption,
  id = "recommendation-filter-by-dropdown",
  height = "36px",
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const handleOptionClick = (option) => {
    setOpen(false);
    onSelectOption?.(option);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className="justify-between gap-2 font-medium bg-white dark:bg-transparent dark:border-white/15 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 px-3 rounded-[8px]"
          style={{ height }}
        >
          <span className="flex items-center gap-1.5 whitespace-nowrap text-[13px]">
            <FiFilter size={13} />
            <span>{t("Filter By")}</span>
            {appliedFilters.length > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-sky-500 text-white text-[10px] font-bold px-1.5 min-w-[18px] h-[18px]">
                {appliedFilters.length}
              </span>
            )}
          </span>
          <ExpandMoreIcon className="text-slate-500 dark:text-slate-400" style={{ fontSize: 16 }} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-56 p-1.5 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl z-[99999]"
      >
        <div
          className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500"
        >
          {t("Filter Options")}
        </div>
        {RECOMMENDATION_FILTER_OPTIONS.map((option) => {
          const isApplied = appliedFilters.some((f) => f.type === option.value);
          return (
            <div
              key={option.value}
              id={`rec-filter-option-${option.value}`}
              className="flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              onClick={() => handleOptionClick(option)}
            >
              <span className="flex items-center gap-1.5">
                {isApplied && <span className="text-emerald-500 font-bold">✓</span>}
                <span>{t(option.labelKey)}</span>
              </span>
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

export function RecommendationAppliedFilters({
  appliedFilters = [],
  onRemove,
  onClearAll,
  onEdit,
  id = "recommendation-applied-filters",
}) {
  const { t } = useTranslation();

  if (!appliedFilters.length) return null;

  return (
    <div className="filter-bar" id={id} style={{ marginBottom: 14 }}>
      <div className="filter-bar__inner">
        <div className="filter-bar__left">
          <span
            className="filter-bar__label"
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <FiFilter />
            {t("Filters")}
          </span>

          <div className="filter-bar__chips">
            {appliedFilters.map((filter) => (
              <div
                key={filter.id}
                className="filter-chip"
                style={{ display: "inline-flex", alignItems: "center" }}
              >
                <span
                  className="filter-chip__label"
                  style={{ cursor: onEdit ? "pointer" : "default" }}
                  onClick={() => onEdit && onEdit(filter)}
                  title={onEdit ? t("Click to edit") : filter.displayText}
                >
                  {filter.displayText}
                </span>
                <button
                  type="button"
                  className="filter-chip__remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove?.(filter.id);
                  }}
                  title={t("Remove filter")}
                >
                  ×
                </button>
              </div>
            ))}

            <button
              type="button"
              className="filter-bar__clear-btn"
              onClick={onClearAll}
            >
              <span style={{ marginRight: 4, fontWeight: "bold" }}>×</span>
              {t("Clear all")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RecommendationFilterModal({
  showFilterModal,
  handleModalClose,
  selectedFilterOption,
  selectedGridNames = [],
  setSelectedGridNames,
  selectedActions = [],
  setSelectedActions,
  tagOptions = [],
  selectedTagIds = [],
  setSelectedTagIds,
  onApply,
  isDark,
}) {
  const { t } = useTranslation();
  const P = getColors(isDark);

  if (!selectedFilterOption) return null;
  const filterType = selectedFilterOption.value;

  const toggleMulti = (val, current, setter) => {
    if (current.includes(val)) setter(current.filter((v) => v !== val));
    else setter([...current, val]);
  };

  const renderContent = () => {
    if (filterType === "AffectedParameter") {
      return (
        <>
          <SectionLabel
            P={P}
            rightAction={
              selectedGridNames.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelectedGridNames([])}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: P.primary,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {t("Clear selection")}
                </button>
              ) : null
            }
          >
            {t("Select Affected Parameter")}
          </SectionLabel>
          {AFFECTED_PARAMETER_OPTIONS.map((opt) => (
            <CheckItem
              key={opt.value}
              checked={selectedGridNames.includes(opt.value)}
              onChange={() => toggleMulti(opt.value, selectedGridNames, setSelectedGridNames)}
              label={t(opt.label)}
              P={P}
            />
          ))}
        </>
      );
    }

    if (filterType === "Action") {
      return (
        <>
          <SectionLabel
            P={P}
            rightAction={
              selectedActions.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelectedActions([])}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: P.primary,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {t("Clear selection")}
                </button>
              ) : null
            }
          >
            {t("Select Action")}
          </SectionLabel>
          {ACTION_FILTER_OPTIONS.map((opt) => (
            <CheckItem
              key={opt.value}
              checked={selectedActions.includes(opt.value)}
              onChange={() => toggleMulti(opt.value, selectedActions, setSelectedActions)}
              label={t(opt.label)}
              badge={t(opt.scope)}
              P={P}
            />
          ))}
        </>
      );
    }

    if (filterType === "Tags") {
      return (
        <>
          <SectionLabel
            P={P}
            rightAction={
              selectedTagIds.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelectedTagIds([])}
                  style={{ fontSize: 12, fontWeight: 600, color: P.primary, background: "transparent", border: "none", cursor: "pointer" }}
                >
                  {t("Clear selection")}
                </button>
              ) : null
            }
          >
            {t("Select Tags")}
          </SectionLabel>
          {tagOptions.length === 0 ? (
            <p style={{ fontSize: 13, color: P.neutral600, margin: "8px 0" }}>
              {t("No tags yet. Add tags to a recommendation in the Recommendation Configuration tab.")}
            </p>
          ) : (
            tagOptions.map((tag) => {
              const tagStyle = getTagStyles(tag.color, isDark);
              return (
                <CheckItem
                  key={tag._id}
                  checked={selectedTagIds.includes(String(tag._id))}
                  onChange={() => toggleMulti(String(tag._id), selectedTagIds, setSelectedTagIds)}
                  label={
                    <span className="inline-flex items-center gap-2">
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 9999,
                          backgroundColor: tagStyle.dot,
                          display: "inline-block",
                        }}
                      />
                      <span>{tag.name}</span>
                    </span>
                  }
                  P={P}
                />
              );
            })
          )}
        </>
      );
    }

    return null;
  };

  return (
    <Dialog open={showFilterModal} onOpenChange={(open) => { if (!open) handleModalClose(); }}>
      <DialogContent className="sm:max-w-[540px] p-0 overflow-hidden bg-white dark:bg-[#0c1222] border border-slate-200 dark:border-white/10" hideCloseButton={false}>
        <DialogHeader
          className="p-5 border-b"
          style={{
            borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #f1f5f9",
          }}
        >
          <DialogTitle asChild>
            <div className="w-full flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    background: isDark ? "rgba(26, 159, 212, 0.15)" : "#E0F4FD",
                    color: "#1A9FD4",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MdFilterAlt size={20} style={{ display: "inline-block" }} />
                </div>
                <span
                  className="font-bold"
                  style={{
                    fontSize: "16px",
                    color: isDark ? "rgba(255, 255, 255, 0.92)" : "#0f172a",
                  }}
                >
                  {t(selectedFilterOption.labelKey || selectedFilterOption.label)}
                </span>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div style={{ padding: "20px 24px", maxHeight: 440, overflowY: "auto" }}>
          {renderContent()}
        </div>

        <DialogFooter
          className="p-4 border-t"
          style={{
            borderTop: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #f1f5f9",
          }}
        >
          <button
            type="button"
            style={{
              background: isDark ? "transparent" : "#fff",
              color: P.neutral700,
              fontWeight: 600,
              borderRadius: 8,
              padding: "8px 16px",
              border: isDark ? "1px solid rgba(255, 255, 255, 0.15)" : `1.5px solid ${P.neutral200}`,
              cursor: "pointer",
              fontSize: 13,
            }}
            onClick={handleModalClose}
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            style={{
              background: "linear-gradient(135deg, #1A9FD4 0%, #2374F2 100%)",
              border: "none",
              borderRadius: "8px",
              padding: "8px 24px",
              fontWeight: "600",
              fontSize: "14px",
              color: "#fff",
              boxShadow: "0 4px 12px rgba(2, 70, 139, 0.15)",
              cursor: "pointer",
            }}
            onClick={onApply}
          >
            {t("Apply")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
