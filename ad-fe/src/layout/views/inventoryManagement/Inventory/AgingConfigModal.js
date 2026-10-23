// AgingConfigModal.js — Per-ASIN/SKU threshold configuration modal

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ApiGetAgingConfig, ApiGetInventoryGrid, ApiSaveAgingConfig } from "../../../../api-wrapper/inventoryManagement/ApiInventoryManagement";
import { Toast } from "../../../../helper/links/Link";
import moment from "moment";
import {
    Dialog,
    DialogContent,
} from "../../../../components/ui/dialog";
import { Button as ShadcnButton } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import InlineEditPopup from "../../../../helper/modal/InlineEditPopup";

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, isDark }) {
    return (
        <div
            onClick={() => onChange(!checked)}
            style={{
                width: 36, height: 20, borderRadius: 10, cursor: "pointer",
                background: checked ? "#10b981" : (isDark ? "rgba(255,255,255,0.15)" : "#d1d5db"),
                position: "relative", transition: "background 0.2s", flexShrink: 0,
            }}
        >
            <div style={{
                position: "absolute", top: 2,
                left: checked ? 18 : 2,
                width: 16, height: 16, borderRadius: "50%",
                background: "#fff", transition: "left 0.2s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }} />
        </div>
    );
}

function AgingConfigModal({ profileId, fromDate, toDate, isOpen, onClose }) {
    const { t } = useTranslation();
    const [items, setItems] = useState([]);  // inventory items (FBA only)
    const [configMap, setConfigMap] = useState({}); // sku → config
    const [editMap, setEditMap] = useState({});   // sku → { minOrdersPerDay, lookbackDays, isEnabled }
    const [saving, setSaving] = useState({});   // sku → true/false
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    // Load inventory items + existing configs
    const loadData = useCallback(async () => {
        if (!profileId) return;
        setLoading(true);
        try {
            const [gridRes, configRes] = await Promise.all([
                ApiGetInventoryGrid({
                    profileId,
                    fulfillmentType: "FBA",
                    fromDate: fromDate || moment().subtract(30, "days").format("YYYY-MM-DD"),
                    toDate: toDate || moment().format("YYYY-MM-DD"),
                    pageNo: 1,
                    perPage: 200,
                }),
                ApiGetAgingConfig({ profileId }),
            ]);

            const gridItems = gridRes?.data || [];
            const configs = configRes?.data || [];

            // Build configMap keyed by sku
            const map = {};
            configs.forEach(c => { map[c.sku] = c; });
            setConfigMap(map);

            // Merge: for each inventory item, overlay existing config or use defaults
            const merged = gridItems.map(item => ({
                sku: item.sku,
                asin: item.asin,
                title: item.title || item.sku,
                image: item.image,
                currentStock: item.currentStock ?? 0,
                salesPerDay: item.salesPerDay ?? 0,
                daysLeft: item.daysLeft ?? 0,
                deadInventoryStatus: item.deadInventoryStatus || null,
                // Config values
                minOrders: map[item.sku]?.minOrders ?? 10,
                lookbackDays: map[item.sku]?.lookbackDays ?? 30,
                isEnabled: map[item.sku]?.isEnabled !== false,
            }));

            setItems(merged);

            // Prime editMap with current values
            const edits = {};
            merged.forEach(m => {
                edits[m.sku] = {
                    minOrders: m.minOrders,
                    lookbackDays: m.lookbackDays,
                    isEnabled: m.isEnabled,
                };
            });
            setEditMap(edits);
        } catch {
            Toast.error(t("Failed to load aging config"));
        } finally {
            setLoading(false);
        }
    }, [profileId, fromDate, toDate]);

    useEffect(() => {
        if (isOpen) loadData();
    }, [isOpen, loadData]);

    const saveRow = async (item, overrides = {}) => {
        const currentEdit = editMap[item.sku] || {};
        const finalData = { ...currentEdit, ...overrides };

        setSaving(prev => ({ ...prev, [item.sku]: true }));
        try {
            const res = await ApiSaveAgingConfig({
                profileId,
                asin: item.asin,
                sku: item.sku,
                minOrders: finalData.minOrders,
                lookbackDays: finalData.lookbackDays,
                isEnabled: finalData.isEnabled,
            });
            if (res?.isSuccess) {
                Toast.success(t("Saved: {{sku}}", { sku: item.sku }));
                setConfigMap(prev => ({ ...prev, [item.sku]: finalData }));
                setEditMap(prev => ({ ...prev, [item.sku]: finalData }));
            } else {
                Toast.error(res?.message || t("Save failed"));
            }
        } catch {
            Toast.error(t("Save failed"));
        } finally {
            setSaving(prev => ({ ...prev, [item.sku]: false }));
        }
    };

    if (!isOpen) return null;

    const filtered = items.filter(it =>
        !search ||
        it.sku?.toLowerCase().includes(search.toLowerCase()) ||
        it.asin?.toLowerCase().includes(search.toLowerCase()) ||
        it.title?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                className="p-0 gap-0 max-w-[900px] border-0 overflow-hidden rounded-2xl flex flex-col max-h-[88vh]"
                style={{
                    background: isDark ? "var(--glass-bg)" : "#fff",
                    boxShadow: isDark ? "0 24px 60px rgba(0,0,0,0.4)" : "0 24px 60px rgba(0,0,0,0.18)",
                }}
            >
                {/* Header */}
                <div style={{
                    padding: "20px 24px",
                    borderBottom: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid #e8ecf0",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
                }}>
                    <div>
                        <div className="flex items-center" style={{ gap: 10 }}>
                            <span style={{ fontSize: 22 }}>⚙️</span>
                            <h5 style={{ margin: 0, color: "#fff", fontWeight: 700, fontSize: 16 }}>
                                {t("Dead Inventory Thresholds")}
                            </h5>
                        </div>
                        <p style={{ margin: "4px 0 0 32px", color: "#94a3b8", fontSize: 12 }}>
                            {t("Set minimum total orders per FBA SKU over the lookback window. If actual orders fall below threshold → classified as Dead Inventory.")}
                        </p>
                    </div>
                    <ShadcnButton
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="text-white hover:bg-white/20 w-8 h-8 rounded-lg flex-shrink-0"
                        style={{ background: "rgba(255,255,255,0.1)" }}
                    >
                        ×
                    </ShadcnButton>
                </div>

                {/* Search + Legend */}
                <div style={{
                    padding: "12px 24px",
                    borderBottom: isDark ? "1px solid var(--glass-border-color)" : "1px solid #f1f5f9",
                    display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                    background: isDark ? "rgba(255,255,255,0.02)" : "#f8fafc",
                }}>
                    <Input
                        placeholder={t("Search by SKU / ASIN / Product...")}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="flex-1 min-w-[200px] h-[34px] text-[13px] rounded-lg focus-visible:ring-0 focus-visible:ring-offset-0"
                        style={{
                            border: isDark ? "1px solid var(--glass-border-color)" : "1px solid #e2e8f0",
                            background: isDark ? "rgba(255,255,255,0.05)" : "#fff",
                            color: isDark ? "#fff" : "#000",
                        }}
                    />
                    <div className="flex flex-wrap" style={{ gap: 10 }}>
                        {[
                            { label: t("Min Orders"), desc: t("Total orders must be ≥ this") },
                            { label: t("Lookback Days"), desc: t("Days of history to count orders") },
                            { label: t("Enabled"), desc: t("Toggle monitoring for this SKU") },
                        ].map(h => (
                            <span key={h.label} title={h.desc} style={{
                                padding: "3px 10px", borderRadius: 6,
                                background: isDark ? "rgba(255,255,255,0.1)" : "#e2e8f0",
                                color: isDark ? "rgba(255,255,255,0.8)" : "#475569",
                                fontSize: 11, fontWeight: 600, cursor: "help",
                            }}>
                                {h.label} ℹ
                            </span>
                        ))}
                    </div>
                </div>

                {/* Table */}
                <div style={{ overflowY: "auto", flex: 1 }}>
                    {loading ? (
                        <div style={{ textAlign: "center", padding: "48px 0", color: "#94a3b8" }}>
                            <i className="fa-solid fa-spinner fa-spin text-blue-500 mb-3" style={{ fontSize: 28 }} />
                            <div>{t("Loading FBA inventory...")}</div>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "48px 0", color: "#94a3b8" }}>
                            {t("No FBA items found")}
                        </div>
                    ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                            <thead style={{ position: "sticky", top: 0, background: isDark ? "rgba(30, 41, 59, 0.95)" : "#f8fafc", zIndex: 1 }}>
                                <tr>
                                    {[t("Product"), t("ASIN / SKU"), t("Stock"), t("Status"), t("Min Orders"), t("Lookback Days"), t("Enabled")].map(h => (
                                        <th key={h} style={{
                                            padding: "10px 12px", textAlign: "left",
                                            color: isDark ? "rgba(255,255,255,0.6)" : "#64748b", fontWeight: 600, fontSize: 11,
                                            letterSpacing: 0.5, textTransform: "uppercase",
                                            borderBottom: isDark ? "2px solid var(--glass-border-color)" : "2px solid #e2e8f0", whiteSpace: "nowrap",
                                        }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((item, i) => {
                                    const edit = editMap[item.sku] || {};
                                    const isDead = item.deadInventoryStatus === "DEAD";
                                    const isSaving = saving[item.sku];
                                    return (
                                        <tr key={item.sku} style={{
                                            background: i % 2 === 0 ? "transparent" : (isDark ? "rgba(255,255,255,0.01)" : "#f8fafc"),
                                            borderBottom: isDark ? "1px solid var(--glass-border-color)" : "1px solid #f1f5f9",
                                            opacity: edit.isEnabled === false ? 0.55 : 1,
                                            transition: "opacity 0.2s",
                                        }}>
                                            {/* Product */}
                                            <td style={{ padding: "10px 12px", minWidth: 180, maxWidth: 220 }}>
                                                <div className="flex items-center" style={{ gap: 8 }}>
                                                    {item.image && (
                                                        <img src={item.image} alt="" style={{
                                                            width: 36, height: 36,
                                                            objectFit: "cover", borderRadius: 6, flexShrink: 0,
                                                        }} />
                                                    )}
                                                    <span style={{
                                                        fontSize: 12, fontWeight: 600,
                                                        color: isDark ? "var(--text-primary)" : "#0f172a",
                                                        display: "-webkit-box", WebkitLineClamp: 2,
                                                        WebkitBoxOrient: "vertical", overflow: "hidden",
                                                    }}>
                                                        {item.title}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* ASIN / SKU */}
                                            <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                                                <div style={{ fontSize: 11, color: isDark ? "var(--text-secondary)" : "#475569" }}>
                                                    <div><strong style={{ color: isDark ? "var(--text-primary)" : "#0f172a" }}>{t("ASIN:")}</strong> {item.asin || "—"}</div>
                                                    <div><strong style={{ color: isDark ? "var(--text-primary)" : "#0f172a" }}>{t("SKU:")}</strong> {item.sku || "—"}</div>
                                                </div>
                                            </td>

                                            {/* Stock */}
                                            <td style={{ padding: "10px 12px", textAlign: "center" }}>
                                                <span style={{ fontSize: 14, fontWeight: 700, color: isDark ? "var(--text-primary)" : "#0f172a" }}>
                                                    {item.currentStock?.toLocaleString()}
                                                </span>
                                                <div style={{ fontSize: 10, color: isDark ? "var(--text-secondary)" : "#94a3b8" }}>{t("units")}</div>
                                            </td>


                                            {/* Dead Status */}
                                            <td style={{ padding: "10px 12px", textAlign: "center" }}>
                                                {isDead ? (
                                                    <span style={{
                                                        padding: "3px 10px", borderRadius: 20,
                                                        fontSize: 11, fontWeight: 700,
                                                        color: isDark ? "#f87171" : "#dc2626",
                                                        background: isDark ? "rgba(239, 68, 68, 0.15)" : "#fee2e2",
                                                        border: isDark ? "1px solid rgba(239, 68, 68, 0.3)" : "none",
                                                    }}>☠ {t("Dead")}</span>
                                                ) : item.deadInventoryStatus === "ACTIVE" ? (
                                                    <span style={{
                                                        padding: "3px 10px", borderRadius: 20,
                                                        fontSize: 11, fontWeight: 700,
                                                        color: isDark ? "#34d399" : "#10b981",
                                                        background: isDark ? "rgba(16, 185, 129, 0.15)" : "#d1fae5",
                                                        border: isDark ? "1px solid rgba(16, 185, 129, 0.3)" : "none",
                                                    }}>✓ {t("Healthy")}</span>
                                                ) : (
                                                    <span style={{ fontSize: 11, color: isDark ? "var(--text-secondary)" : "#94a3b8" }}>—</span>
                                                )}
                                            </td>

                                            {/* Min Orders */}
                                            <td style={{ padding: "10px 12px" }}>
                                                <InlineEditPopup
                                                    value={edit.minOrders ?? 10}
                                                    title={t("Min Orders")}
                                                    append={t("orders")}
                                                    onSave={v => saveRow(item, { minOrders: v })}
                                                />
                                            </td>

                                            {/* Lookback Days */}
                                            <td style={{ padding: "10px 12px" }}>
                                                <InlineEditPopup
                                                    value={edit.lookbackDays ?? 30}
                                                    title={t("Lookback Days")}
                                                    append={t("days")}
                                                    min={7}
                                                    onSave={v => saveRow(item, { lookbackDays: v })}
                                                />
                                            </td>

                                            {/* Enabled toggle */}
                                            <td style={{ padding: "10px 12px", textAlign: "center" }}>
                                                <Toggle
                                                    checked={edit.isEnabled !== false}
                                                    onChange={v => saveRow(item, { isEnabled: v })}
                                                    isDark={isDark}
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: "12px 24px",
                    borderTop: isDark ? "1px solid var(--glass-border-color)" : "1px solid #e8ecf0",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: isDark ? "rgba(255,255,255,0.02)" : "#f8fafc",
                }}>
                    <span style={{ fontSize: 12, color: isDark ? "var(--text-secondary)" : "#94a3b8" }}>
                        {filtered.length === 1
                            ? t("{{count}} FBA SKU shown", { count: filtered.length })
                            : t("{{count}} FBA SKUs shown", { count: filtered.length })}
                        {search ? ` ${t("(filtered from {{total}})", { total: items.length })}` : ""}
                    </span>
                    <ShadcnButton
                        variant="outline"
                        onClick={onClose}
                        className="px-5 h-9 rounded-lg border font-semibold text-[13px]"
                        style={{
                            borderColor: isDark ? "var(--glass-border-color)" : "#e2e8f0",
                            background: isDark ? "rgba(255,255,255,0.05)" : "#fff",
                            color: isDark ? "rgba(255,255,255,0.8)" : "#475569",
                        }}
                    >
                        {t("Close")}
                    </ShadcnButton>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default AgingConfigModal;
