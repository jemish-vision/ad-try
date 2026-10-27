import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import React, { useContext, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ProfileContext } from "../../usecontext/useContext";

function ConfigTypeDropdown({ compact = false }) {
    const { t } = useTranslation();
    const { selectedAdType: selection, setSelectedAdType: setSelection } = useContext(ProfileContext);

    const typeList = useMemo(() => [
        // "All" = SP + SB + SD combined. Listed first per request; SP remains the
        // default (the seeding effect below seeds "SP" explicitly, not typeList[0]).
        { key: "All", label: t("All Ad Types") },
        { key: "SP", label: t("Sponsored Products") },
        { key: "SB", label: t("Sponsored Brands") },
        { key: "SD", label: t("Sponsored Display") }
    ], [t]);

    useEffect(() => {
        if (!selection) setSelection("SP");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selection]);

    return (
        <Select value={selection || "SP"} onValueChange={(val) => {
            setSelection(val);
            localStorage.setItem("adType", val);
        }}>
            <SelectTrigger
                className={`glass-dropdown-btn ad-type-select-trigger ${compact ? "px-2" : "px-4"} h-[40px] font-semibold border border-gray-200 dark:border-white/10`}
                style={{
                    width: compact ? "auto" : "auto",
                    minWidth: compact ? "auto" : "150px",
                    maxWidth: compact ? "none" : "210px",
                    color: "var(--button-secondary-text)",
                    fontSize: "13px"
                }}
            >
                {compact ? (
                    <div className="flex items-center gap-1.5">
                        <i className="fa-solid fa-layer-group text-blue-500 dark:text-blue-400"></i>
                        <span className="font-bold">{selection}</span>
                    </div>
                ) : (
                    <SelectValue placeholder={t("Select Ad Type")} />
                )}
            </SelectTrigger>
            <SelectContent align="start" className="z-[10000]">
                {typeList.map((type) => (
                    <SelectItem
                        key={type.key}
                        value={type.key}
                        className={`font-medium cursor-pointer text-[13px] py-2 ${selection === type.key ? "bg-[#EEF4FC] focus:bg-[#EEF4FC] text-blue-600 focus:text-blue-600 dark:bg-[rgba(60,187,242,0.15)] dark:focus:bg-[rgba(60,187,242,0.15)] dark:text-blue-400 dark:focus:text-blue-400" : ""}`}
                    >
                        {type.label} ({type.key})
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

export default React.memo(ConfigTypeDropdown);
