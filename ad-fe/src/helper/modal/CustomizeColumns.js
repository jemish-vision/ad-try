import { Checkbox } from "../../components/ui/checkbox";
import { Label } from "../../components/ui/label";
import { useEffect, useState, useMemo } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
    sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { useTranslation } from 'react-i18next';

function SortableItem({ id, title, isDefault, onMoveUp, onMoveDown, isFirst, isLast }) {
    const { t } = useTranslation();
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        touchAction: 'none',
        userSelect: 'none',
        padding: '10px 14px',
        borderRadius: '10px',
        marginBottom: 8,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        cursor: isDragging ? 'grabbing' : 'grab',
        zIndex: isDragging ? 99 : 1,
        position: 'relative',
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={`cc-sort-item${isDefault ? ' cc-sort-item--default' : ''}${isDragging ? ' cc-sort-item--dragging' : ''}`}
        >
            <div className="flex items-center gap-2.5 overflow-hidden flex-1 pointer-events-none">
                <i className="fa-solid fa-grip-vertical cc-sort-item-grip text-slate-400"></i>
                <span className="cc-sort-item-label truncate select-none">
                    {t(title)} {isDefault && <small className="text-gray-400 dark:text-gray-500 ml-1" style={{ fontSize: '10.5px' }}>{t("(Default)")}</small>}
                </span>
            </div>
            <div
                className="flex items-center gap-1 shrink-0 ml-2"
                onPointerDown={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    disabled={isFirst}
                    onClick={(e) => {
                        e.stopPropagation();
                        onMoveUp?.();
                    }}
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-20 disabled:pointer-events-none text-slate-500 dark:text-slate-400 transition-colors"
                    title={t("Move Up")}
                >
                    <i className="fa-solid fa-chevron-up" style={{ fontSize: 10 }}></i>
                </button>
                <button
                    type="button"
                    disabled={isLast}
                    onClick={(e) => {
                        e.stopPropagation();
                        onMoveDown?.();
                    }}
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-20 disabled:pointer-events-none text-slate-500 dark:text-slate-400 transition-colors"
                    title={t("Move Down")}
                >
                    <i className="fa-solid fa-chevron-down" style={{ fontSize: 10 }}></i>
                </button>
            </div>
        </div>
    );
}

function CustomizeColumns({
    showModal,
    setShowModal,
    allColumns = [],
    handler,
    selectedColumn = [],
    defaultColumns = [],
}) {
    const { t } = useTranslation();
    const [selectedColumns, setSelectedColumns] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 3,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Normalize allColumns so every column has a stable title property and filter out internal columns
    const normalizedAllColumns = useMemo(() => {
        if (!allColumns || !Array.isArray(allColumns)) return [];
        return allColumns
            .filter((col) => {
                if (!col) return false;
                if (col.field === "expand" || col.field === "checkbox" || col.checkboxSelection) return false;
                if (!col.title && !col.headerName && (col.field === "campaignId" || col.maxWidth <= 50)) return false;
                return Boolean(col.title || col.headerName || col.field);
            })
            .map((col) => {
                const title = col.title || (typeof col.headerName === "string" && col.headerName.trim() ? col.headerName : col.field);
                return {
                    ...col,
                    title,
                };
            });
    }, [allColumns]);

    const filteredAvailableColumns = useMemo(() => {
        if (!searchQuery.trim()) return normalizedAllColumns;
        const q = searchQuery.toLowerCase().trim();
        return normalizedAllColumns.filter(col =>
            (col.title && col.title.toLowerCase().includes(q)) ||
            (col.headerName && typeof col.headerName === "string" && col.headerName.toLowerCase().includes(q)) ||
            (col.field && col.field.toLowerCase().includes(q))
        );
    }, [normalizedAllColumns, searchQuery]);

    const handleColumnToggle = (title, checked) => {
        if (!checked && defaultColumns.includes(title)) return;

        if (checked) {
            setSelectedColumns((prev) => {
                if (!prev.some((col) => col.title === title)) {
                    return [...prev, { title, isDisplay: true, isDefault: defaultColumns.includes(title), order: prev.length + 1 }];
                }
                return prev;
            });
        } else {
            setSelectedColumns((prev) => prev.filter((col) => col.title !== title));
        }
    };

    const handleSelectAll = () => {
        const newSelected = [...selectedColumns];
        normalizedAllColumns.forEach(col => {
            if (!newSelected.some(s => s.title === col.title)) {
                newSelected.push({
                    title: col.title,
                    isDisplay: true,
                    isDefault: defaultColumns.includes(col.title),
                    order: newSelected.length + 1,
                });
            }
        });
        setSelectedColumns(newSelected);
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        setSelectedColumns((items) => {
            const oldIndex = items.findIndex((col) => col.title === active.id);
            const newIndex = items.findIndex((col) => col.title === over.id);
            if (oldIndex === -1 || newIndex === -1) return items;
            return arrayMove(items, oldIndex, newIndex);
        });
    };

    const handleMoveItem = (index, direction) => {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= selectedColumns.length) return;
        setSelectedColumns((items) => arrayMove(items, index, newIndex));
    };

    const submitHandler = () => {
        const finalCols = normalizedAllColumns.map((col) => {
            const foundIndex = selectedColumns.findIndex((s) => s.title === col.title);
            const isSelected = foundIndex !== -1;
            return {
                title: col.title,
                field: col.field,
                isDisplay: isSelected,
                order: isSelected ? foundIndex + 1 : 9999,
                isDefault: defaultColumns.includes(col.title),
            };
        });
        if (typeof handler === "function") {
            handler(finalCols);
        }
        setShowModal(false);
    };

    useEffect(() => {
        if (!showModal) return;

        const currentSelected = [];

        // 1. If selectedColumn passed, preserve their order
        if (selectedColumn && selectedColumn.length > 0) {
            const sorted = [...selectedColumn]
                .filter(c => c && c.title && c.title !== "Checkbox" && c.isDisplay !== false)
                .sort((a, b) => (a?.order ?? 999) - (b?.order ?? 999));

            sorted.forEach(c => {
                if (!currentSelected.some(s => s.title === c.title)) {
                    currentSelected.push({
                        title: c.title,
                        isDisplay: true,
                        isDefault: defaultColumns.includes(c.title),
                        order: c.order,
                    });
                }
            });
        }

        // 2. Ensure all defaultColumns are present in selected
        defaultColumns
            .filter(t => t && t !== "Checkbox")
            .forEach((title, idx) => {
                if (!currentSelected.some(s => s.title === title)) {
                    currentSelected.splice(idx, 0, {
                        title,
                        isDisplay: true,
                        isDefault: true,
                        order: idx + 1,
                    });
                }
            });

        // 3. Fallback: if selectedColumns is still empty, populate from visible normalized columns
        if (currentSelected.length === 0 && normalizedAllColumns.length > 0) {
            normalizedAllColumns.forEach((col, idx) => {
                if (!col.hide) {
                    currentSelected.push({
                        title: col.title,
                        isDisplay: true,
                        isDefault: defaultColumns.includes(col.title),
                        order: idx + 1,
                    });
                }
            });
        }

        setSelectedColumns(currentSelected);
        setSearchQuery("");
    }, [showModal, selectedColumn, defaultColumns, normalizedAllColumns]);

    return (
        <>
            <style>{`
                /* ── Modal shell ── */
                .customize-columns-modal .modal-content {
                    background: var(--dropdown-bg, rgba(255,255,255,0.95)) !important;
                    backdrop-filter: blur(18px) saturate(180%) !important;
                    -webkit-backdrop-filter: blur(18px) saturate(180%) !important;
                    border: var(--glass-border, 1px solid rgba(0,0,0,0.09)) !important;
                    border-radius: 20px !important;
                    box-shadow: 0 24px 60px rgba(15,23,42,0.14) !important;
                    overflow: hidden !important;
                    color: var(--text-primary) !important;
                }
                 [data-theme="dark"] .customize-columns-modal .modal-content {
                    background: #1e293b !important;
                    border: 1px solid rgba(255, 255, 255, 0.16) !important;
                    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.85), 0 0 1px rgba(255, 255, 255, 0.2) !important;
                }
                [data-theme="dark"] .modal-backdrop {
                    background-color: #000000 !important;
                }
                [data-theme="dark"] .modal-backdrop.show {
                    opacity: 0.75 !important;
                }

                /* ── Header ── */
                .customize-columns-modal .modal-header {
                    background: rgba(248,250,252,0.80) !important;
                    border-bottom: 1px solid rgba(0,0,0,0.07) !important;
                    padding: 18px 24px !important;
                }
                [data-theme="dark"] .customize-columns-modal .modal-header {
                    background: rgba(255,255,255,0.03) !important;
                    border-bottom-color: rgba(255,255,255,0.08) !important;
                }
                .customize-columns-modal .modal-title {
                    color: var(--text-primary) !important;
                    font-size: 15px !important;
                    font-weight: 700 !important;
                }
                [data-theme="dark"] .customize-columns-modal .modal-title {
                    color: rgba(255,255,255,0.92) !important;
                }

                /* ── Body ── */
                .customize-columns-modal .modal-body {
                    background: transparent !important;
                    padding: 24px !important;
                }

                /* ── Scrollbar ── */
                .customize-columns-modal .modal-body::-webkit-scrollbar,
                .customize-columns-modal *::-webkit-scrollbar {
                    width: 5px !important; height: 5px !important;
                }
                .customize-columns-modal .modal-body::-webkit-scrollbar-track,
                .customize-columns-modal *::-webkit-scrollbar-track {
                    background: transparent !important;
                    border-radius: 10px !important;
                }
                .customize-columns-modal .modal-body::-webkit-scrollbar-thumb,
                .customize-columns-modal *::-webkit-scrollbar-thumb {
                    background: rgba(2,70,139,0.15) !important;
                    border-radius: 10px !important;
                }
                [data-theme="dark"] .customize-columns-modal .modal-body::-webkit-scrollbar-thumb,
                [data-theme="dark"] .customize-columns-modal *::-webkit-scrollbar-thumb {
                    background: rgba(255,255,255,0.10) !important;
                }

                /* ── Footer ── */
                .customize-columns-modal .modal-footer {
                    background: rgba(248,250,252,0.60) !important;
                    border-top: 1px solid rgba(0,0,0,0.07) !important;
                    padding: 14px 24px !important;
                }
                [data-theme="dark"] .customize-columns-modal .modal-footer {
                    background: rgba(255,255,255,0.02) !important;
                    border-top-color: rgba(255,255,255,0.07) !important;
                }

                /* ── SortableItem ── */
                .cc-sort-item {
                    border: 1px solid rgba(0,0,0,0.08);
                    background: rgba(255,255,255,0.85);
                    box-shadow: 0 1px 3px rgba(15,23,42,0.04);
                    transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
                }
                .cc-sort-item:hover {
                    border-color: rgba(2,70,139,0.25);
                    background: #ffffff;
                    box-shadow: 0 2px 8px rgba(2,70,139,0.08);
                }
                .cc-sort-item--dragging {
                    background: #ffffff !important;
                    border-color: #1A9FD4 !important;
                    box-shadow: 0 8px 24px rgba(2,70,139,0.20) !important;
                }
                .cc-sort-item--default {
                    background: rgba(241,245,249,0.70) !important;
                    border-color: rgba(0,0,0,0.06) !important;
                }
                [data-theme="dark"] .cc-sort-item {
                    border-color: rgba(255,255,255,0.08) !important;
                    background: rgba(255,255,255,0.05) !important;
                    box-shadow: none !important;
                }
                [data-theme="dark"] .cc-sort-item:hover {
                    border-color: rgba(60,187,242,0.30) !important;
                    background: rgba(255,255,255,0.08) !important;
                }
                [data-theme="dark"] .cc-sort-item--dragging {
                    background: #1e293b !important;
                    border-color: #2374F2 !important;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.45) !important;
                }
                [data-theme="dark"] .cc-sort-item--default {
                    background: rgba(255,255,255,0.03) !important;
                    border-color: rgba(255,255,255,0.05) !important;
                }
                .cc-sort-item-label {
                    font-size: 13px;
                    font-weight: 600;
                    color: #1e293b;
                }
                [data-theme="dark"] .cc-sort-item-label {
                    color: rgba(255,255,255,0.85) !important;
                }
                .cc-sort-item--default .cc-sort-item-label {
                    font-weight: 500;
                    color: #475569;
                }
                [data-theme="dark"] .cc-sort-item--default .cc-sort-item-label {
                    color: rgba(255,255,255,0.60) !important;
                }
                .cc-sort-item-grip {
                    font-size: 12px;
                    opacity: 0.50;
                    color: #64748b;
                }
                [data-theme="dark"] .cc-sort-item-grip {
                    color: rgba(255,255,255,0.40) !important;
                }
            `}</style>

            <Dialog open={showModal} onOpenChange={setShowModal}>
                <DialogContent className="w-[92vw] sm:max-w-4xl customize-columns-modal overflow-hidden p-0 gap-0 border-0 bg-transparent shadow-none rounded-[20px]" style={{ background: 'transparent' }}>
                    <div className="bg-white/95 dark:bg-[#151d30] backdrop-blur-xl border border-black/10 dark:border-white/20 rounded-[20px] shadow-2xl overflow-hidden flex flex-col">
                        <DialogHeader className="bg-slate-50/80 dark:bg-white/5 border-b border-black/5 dark:border-white/10 p-5 px-6">
                            <DialogTitle>
                                <div className="flex items-center gap-2">
                                    <span className="w-[34px] h-[34px] bg-[#02468b17] border border-black/5 dark:border-white/10 rounded-[9px] inline-flex items-center justify-center text-[#1A9FD4] shrink-0">
                                        <i className="fa-solid fa-table-columns" style={{ fontSize: 14 }}></i>
                                    </span>
                                    {t("Customize Columns")}
                                </div>
                            </DialogTitle>
                        </DialogHeader>

                        <div style={{ maxHeight: '60vh' }} className="overflow-auto p-6 bg-white dark:bg-[#151d30]">
                            <div className="grid grid-cols-2 gap-8">
                                {/* Left — Available Columns */}
                                <div className="border-r border-slate-200 dark:border-slate-700 pr-6 flex flex-col">
                                    <div className="flex items-center justify-between mb-3">
                                        <h6 className="font-bold text-[13px] m-0 text-slate-800 dark:text-slate-200">
                                            {t("Available Columns")} ({filteredAvailableColumns.length})
                                        </h6>
                                        <button
                                            type="button"
                                            onClick={handleSelectAll}
                                            className="text-[11.5px] font-semibold text-[#1A9FD4] hover:underline cursor-pointer bg-transparent border-0 p-0"
                                        >
                                            {t("Select All")}
                                        </button>
                                    </div>

                                    {/* Search input for available columns */}
                                    <div className="relative mb-3">
                                        <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none" />
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder={t("Search column...")}
                                            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#1A9FD4]"
                                        />
                                        {searchQuery && (
                                            <button
                                                type="button"
                                                onClick={() => setSearchQuery("")}
                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                                            >
                                                <i className="fa-solid fa-xmark"></i>
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-2 overflow-y-auto pr-1" style={{ maxHeight: '42vh' }}>
                                        {filteredAvailableColumns.map((col, index) => {
                                            const isDefault = defaultColumns.includes(col.title);
                                            const checked = !!selectedColumns.find((c) => c.title === col.title);
                                            return (
                                                <div key={col.title || index} className="flex items-center mb-1">
                                                    <Label className={`flex items-center gap-2.5 cursor-pointer select-none py-1 px-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50 w-full transition-colors ${isDefault ? 'opacity-60 cursor-not-allowed' : ''}`}>
                                                        <Checkbox
                                                            checked={checked}
                                                            disabled={isDefault}
                                                            onCheckedChange={(checked) => handleColumnToggle(col.title, checked)}
                                                        />
                                                        <span className="text-[13px] font-medium leading-none text-slate-700 dark:text-slate-200 truncate">
                                                            {t(col.title)} {isDefault && <small className="text-gray-400 dark:text-gray-500 ml-1" style={{ fontSize: '10.5px' }}>{t("(Default)")}</small>}
                                                        </span>
                                                    </Label>
                                                </div>
                                            );
                                        })}
                                        {filteredAvailableColumns.length === 0 && (
                                            <div className="text-center py-6 text-xs text-slate-400">
                                                {t("No matching columns")}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Right — Draggable Selected Columns */}
                                <div className="pl-2 flex flex-col">
                                    <div className="flex items-center justify-between mb-3">
                                        <h6 className="font-bold m-0 text-slate-800 dark:text-slate-200 text-[13px]">
                                            {selectedColumns.length} {t("Selected")}
                                        </h6>
                                        {selectedColumns.length > defaultColumns.length && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-rose-500 hover:text-rose-400 dark:text-rose-400 dark:hover:text-rose-300 text-decoration-none p-0 font-bold h-auto hover:bg-transparent"
                                                style={{ fontSize: '12px' }}
                                                onClick={() => setSelectedColumns(selectedColumns.filter(col => defaultColumns.includes(col.title)))}
                                            >
                                                {t("Remove all")}
                                            </Button>
                                        )}
                                    </div>

                                    <div className="text-[11px] text-slate-400 mb-2.5">
                                        <i className="fa-solid fa-arrows-up-down mr-1"></i>
                                        {t("Drag items or use arrows to change column order in the grid")}
                                    </div>

                                    <DndContext
                                        sensors={sensors}
                                        collisionDetection={closestCenter}
                                        modifiers={[restrictToVerticalAxis]}
                                        onDragEnd={handleDragEnd}
                                    >
                                        <SortableContext
                                            items={selectedColumns.map((col) => col.title)}
                                            strategy={verticalListSortingStrategy}
                                        >
                                            <div style={{ maxHeight: '42vh', overflowY: 'auto', paddingRight: '4px' }}>
                                                {selectedColumns.map((col, index) => (
                                                    <SortableItem
                                                        key={col.title}
                                                        id={col.title}
                                                        title={col.title}
                                                        isDefault={defaultColumns.includes(col.title)}
                                                        isFirst={index === 0}
                                                        isLast={index === selectedColumns.length - 1}
                                                        onMoveUp={() => handleMoveItem(index, -1)}
                                                        onMoveDown={() => handleMoveItem(index, 1)}
                                                    />
                                                ))}
                                                {selectedColumns.length === 0 && (
                                                    <div className="text-center py-8 text-xs text-slate-400">
                                                        {t("No columns selected")}
                                                    </div>
                                                )}
                                            </div>
                                        </SortableContext>
                                    </DndContext>
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="bg-slate-50/60 dark:bg-white/5 border-t border-black/5 dark:border-white/10 p-4 px-6 gap-2 sm:gap-0 sm:justify-end sm:space-x-2">
                            <Button
                                variant="outline"
                                className="font-semibold text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600"
                                onClick={() => setShowModal(false)}
                            >
                                {t("cancel")}
                            </Button>
                            <Button
                                onClick={submitHandler}
                                className="btn-campaign-primary"
                            >
                                {t("submit")}
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default CustomizeColumns;
