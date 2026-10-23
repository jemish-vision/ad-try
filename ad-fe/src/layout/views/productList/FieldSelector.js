import React, { useState, useRef, useEffect } from "react";
import { 
    CheckCircle2 as CheckCircle, 
    FileText as Description, 
    Lock, 
    Search, 
    X as Close, 
    GripVertical as DragIndicator, 
    Info as InfoOutlined, 
    PlusCircle as AddCircleOutline, 
    List as ViewList, 
    MoreHorizontal as MoreHoriz 
} from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, DragOverlay } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AppTooltip } from "../../../components/ui/AppTooltip";
import { useTranslation } from "react-i18next";

// --- Custom Components for Drag and Drop ---
const SortableItem = ({ field, toggleField, isMandatory }) => {
    const { t } = useTranslation();
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: field.key });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 100 : 1,
        opacity: isDragging ? 0.8 : 1,
        boxShadow: isDragging ? "0 5px 15px rgba(0,0,0,0.1)" : "none",
    };

    return (
        <div ref={setNodeRef} style={style} className="fs-selected-row">
            <div className="fs-selected-drag-handle" {...attributes} {...listeners}>
                <DragIndicator className="h-4 w-4 text-slate-400 cursor-grab" />
            </div>

            <div className="fs-selected-row-content min-w-0 overflow-hidden">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 block truncate">
                    {t(field.label)}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 block truncate">
                    {isMandatory ? t("Core Info • Mandatory") : t("Marketing")}
                </span>
            </div>

            <div className="fs-selected-row-action">
                {isMandatory ? (
                    <AppTooltip text={t("Mandatory field")} arrow>
                        <Lock className="fs-lock-icon h-4 w-4 text-slate-400" />
                    </AppTooltip>
                ) : (
                    <button
                        type="button"
                        onClick={() => toggleField(field)}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none"
                    >
                        <Close className="h-4.5 w-4.5 text-slate-500 hover:text-slate-700" />
                    </button>
                )}
            </div>
        </div>
    );
};

const DraggableFieldCard = ({ field, isSelected, isMandatory, toggleField }) => {
    const { t } = useTranslation();
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `left-${field.key}`,
        data: { type: 'left-item', field },
        disabled: isSelected || isMandatory
    });

    return (
        <div
            ref={setNodeRef}
            {...(isSelected || isMandatory ? {} : listeners)}
            {...(isSelected || isMandatory ? {} : attributes)}
            className={`fs-field-card ${isMandatory ? 'fs-mandatory' : ''} ${isSelected ? 'selected' : ''}`}
            onClick={() => {
                if (!isDragging) toggleField(field);
            }}
            style={{
                opacity: isDragging ? 0.4 : 1,
                cursor: (isSelected || isMandatory) ? (isMandatory ? 'not-allowed' : 'pointer') : 'grab'
            }}
        >
            <div className="flex items-center gap-3 min-w-0">
                <div className={`fs-field-icon-box ${!isMandatory ? 'dotted' : ''}`}>
                    {isMandatory ? (
                        <Description className="h-4.5 w-4.5" />
                    ) : (
                        <span className="text-xs flex flex-wrap w-3.5 h-4 gap-0.5 align-content-center justify-center">
                            <span className="w-1 h-1 bg-current rounded-full" />
                            <span className="w-1 h-1 bg-current rounded-full" />
                            <span className="w-1 h-1 bg-current rounded-full" />
                            <span className="w-1 h-1 bg-current rounded-full" />
                            <span className="w-1 h-1 bg-current rounded-full" />
                            <span className="w-1 h-1 bg-current rounded-full" />
                        </span>
                    )}
                </div>
                <div className="fs-field-text min-w-0 overflow-hidden text-left">
                    <span className="fs-field-label text-sm font-semibold block truncate color-inherit">{t(field.label)}</span>
                    <span className="fs-field-key text-xs block truncate color-inherit opacity-75">{field.key}</span>
                </div>
            </div>
            <div className="fs-field-right">
                {isSelected ? (
                    <CheckCircle className="fs-check-icon text-emerald-500 h-5.5 w-5.5" />
                ) : isMandatory ? (
                    <Lock className="fs-lock-icon h-5 w-5 text-slate-400" />
                ) : (
                    <AddCircleOutline className="fs-add-icon text-slate-400 h-5.5 w-5.5" />
                )}
            </div>
        </div>
    );
};

export default function FieldSelector({ mandatoryFields, otherFields, selectedFields, toggleField, setSelectedFields }) {
    const { t } = useTranslation();
    const [globalSearch, setGlobalSearch] = useState("");
    const [attributeSearch, setAttributeSearch] = useState("");
    const [activeTab, setActiveTab] = useState("all"); // 'all', 'mandatory', 'others'

    const tabTrackRef = useRef(null);
    const [indicatorStyle, setIndicatorStyle] = useState({ left: 3, width: 0, opacity: 0 });

    useEffect(() => {
        const updateIndicator = () => {
            if (!tabTrackRef.current) return;
            const activeButton = tabTrackRef.current.querySelector('.or-tab-switcher__btn--active');
            if (activeButton) {
                setIndicatorStyle((prev) => {
                    const nextLeft = activeButton.offsetLeft;
                    const nextWidth = activeButton.offsetWidth;
                    if (prev.left === nextLeft && prev.width === nextWidth && prev.opacity === 1) return prev;
                    return { left: nextLeft, width: nextWidth, opacity: 1 };
                });
            }
        };

        updateIndicator();
        if (!tabTrackRef.current) return;

        const ro = new ResizeObserver(() => updateIndicator());
        ro.observe(tabTrackRef.current);
        Array.from(tabTrackRef.current.children).forEach((child) => ro.observe(child));

        const mo = new MutationObserver(() => updateIndicator());
        mo.observe(tabTrackRef.current, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

        return () => {
            ro.disconnect();
            mo.disconnect();
        };
    }, [activeTab, mandatoryFields.length, otherFields.length]);

    const [activeDragField, setActiveDragField] = useState(null);

    const { setNodeRef: setDroppableRef, isOver: isOverDroppable } = useDroppable({
        id: 'right-pane-droppable'
    });

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragStart = (event) => {
        const { active } = event;
        if (active.data.current?.type === 'left-item') {
            setActiveDragField(active.data.current.field);
        }
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        setActiveDragField(null);

        if (!over) return;

        // If dragging a left-item over the right pane
        if (active.data.current?.type === 'left-item') {
            const field = active.data.current.field;
            if (!selectedFields.some(f => f.key === field.key)) {
                // If dropped on an existing sortable item, insert it there. Otherwise, append to end.
                let newIndex = selectedFields.length;
                if (over.id !== 'right-pane-droppable') {
                    newIndex = selectedFields.findIndex(f => f.key === over.id);
                    if (newIndex === -1) newIndex = selectedFields.length;
                }

                const newSelected = [...selectedFields];
                newSelected.splice(newIndex, 0, field);
                setSelectedFields(newSelected);
            }
            return;
        }

        // Sorting within the right pane
        if (active.id !== over.id) {
            setSelectedFields((items) => {
                const oldIndex = items.findIndex((item) => item.key === active.id);
                const newIndex = items.findIndex((item) => item.key === over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const filterFields = (fields, query) => {
        if (!query.trim()) return fields;
        const q = query.toLowerCase();
        return fields.filter(
            (f) => f.label?.toLowerCase().includes(q) || f.key?.toLowerCase().includes(q)
        );
    };

    let filteredMandatory = filterFields(mandatoryFields, globalSearch);
    let filteredOther = filterFields(otherFields, globalSearch);

    if (activeTab === "mandatory") {
        filteredOther = [];
    } else if (activeTab === "others") {
        filteredMandatory = [];
    }

    return (
        <div className="flex flex-col flex-1 min-h-0 gap-1 overflow-hidden">
            {/* TOP HEADER AREA */}
            <div className="data_content data_content_btn m-0 p-5 flex-shrink-0 flex justify-between items-start flex-wrap gap-4">
                <div>
                    <h5 className="fs-main-title text-xl font-extrabold text-slate-800 dark:text-slate-100 mb-1">
                        {t("Select Fields")}
                    </h5>
                    <p className="fs-main-subtitle text-xs text-slate-500 dark:text-slate-400 font-semibold">
                        {t("Choose fields to customize your product schema form template.")}
                    </p>
                </div>
                <div className="w-full sm:w-[320px] relative flex items-center">
                    <Search className="absolute left-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                    <input
                        id="fs-search-area"
                        type="text"
                        placeholder={t("Search fields or attributes...")}
                        value={globalSearch}
                        onChange={(e) => setGlobalSearch(e.target.value)}
                        className="w-full h-9 pl-10 pr-4 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full focus:outline-none focus:border-[#2374F2] focus:ring-1 focus:ring-[#2374F2] text-slate-850 dark:text-slate-100 shadow-sm"
                    />
                </div>
            </div>

            {/* CENTER SECTION */}
            <div className="data_content data_content_btn m-0 p-6 flex-1 overflow-y-auto md:overflow-hidden flex flex-col min-h-0">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                    <div className="fs-container h-auto md:h-full min-h-0 flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* LEFT SIDE: SELECT FIELDS AREA */}
                        <div id="fs-left-pane" className="fs-left-pane flex flex-col h-auto md:h-full min-h-0">

                            {/* Animated Tabs */}
                            <div className="flex items-center justify-between mb-4 flex-wrap gap-4 flex-shrink-0">
                                <div id="keyword-tracker-sub-tabs" className="w-fit">
                                    <div className="relative flex min-w-max p-1 bg-slate-100 dark:bg-slate-950 rounded-xl" ref={tabTrackRef}>
                                        <div
                                            className="absolute top-1 bottom-1 bg-gradient-to-r from-[#1A9FD4] to-[#2374F1] dark:from-slate-800 dark:to-slate-800 rounded-lg shadow-sm transition-all duration-300 pointer-events-none"
                                            style={indicatorStyle}
                                        />
                                        <button
                                            type="button"
                                            className={`relative z-10 px-4 py-1.5 text-xs font-bold rounded-lg transition-colors duration-200 flex items-center gap-1.5 focus:outline-none ${
                                                activeTab === 'all'
                                                    ? "or-tab-switcher__btn--active text-white"
                                                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-350"
                                            }`}
                                            onClick={() => setActiveTab('all')}
                                        >
                                            {t("All Fields")}
                                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ml-1 transition-colors ${
                                                activeTab === 'all' ? "bg-white/20 text-white" : "bg-slate-200/60 dark:bg-slate-800 text-slate-500"
                                            }`}>
                                                {mandatoryFields.length + otherFields.length}
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            className={`relative z-10 px-4 py-1.5 text-xs font-bold rounded-lg transition-colors duration-200 flex items-center gap-1.5 focus:outline-none ${
                                                activeTab === 'mandatory'
                                                    ? "or-tab-switcher__btn--active text-white"
                                                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-350"
                                            }`}
                                            onClick={() => setActiveTab('mandatory')}
                                        >
                                            {t("Mandatory")}
                                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ml-1 transition-colors ${
                                                activeTab === 'mandatory' ? "bg-white/20 text-white" : "bg-slate-200/60 dark:bg-slate-800 text-slate-500"
                                            }`}>
                                                {mandatoryFields.length}
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            className={`relative z-10 px-4 py-1.5 text-xs font-bold rounded-lg transition-colors duration-200 flex items-center gap-1.5 focus:outline-none ${
                                                activeTab === 'others'
                                                    ? "or-tab-switcher__btn--active text-white"
                                                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-350"
                                            }`}
                                            onClick={() => setActiveTab('others')}
                                        >
                                            {t("Others")}
                                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ml-1 transition-colors ${
                                                activeTab === 'others' ? "bg-white/20 text-white" : "bg-slate-200/60 dark:bg-slate-800 text-slate-500"
                                            }`}>
                                                {otherFields.length}
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* SCROLLABLE LEFT LIST */}
                            <div id="fs-left-fields-list" className="flex-1 overflow-y-auto pr-1 mb-[185px]">
                                {/* Mandatory Fields List */}
                                {filteredMandatory.length > 0 && (
                                    <div className="mb-6">
                                        <span className="fs-section-title text-[10px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider mb-3 block uppercase">
                                            {t("MANDATORY FIELDS")}
                                        </span>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {filteredMandatory.map((field) => {
                                                const isSelected = selectedFields.some((f) => f.key === field.key);
                                                return (
                                                    <DraggableFieldCard
                                                        key={field.key}
                                                        field={field}
                                                        isSelected={isSelected}
                                                        isMandatory={true}
                                                        toggleField={toggleField}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Product Attributes (Other Fields) List */}
                                {(activeTab === 'all' || activeTab === 'others') && (
                                    <div className="mb-2">
                                        <span className="fs-section-title text-[10px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider mb-3 block uppercase">
                                            {t("PRODUCT ATTRIBUTES")}
                                        </span>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {filteredOther.map((field) => {
                                                const isSelected = selectedFields.some((f) => f.key === field.key);
                                                return (
                                                    <DraggableFieldCard
                                                        key={field.key}
                                                        field={field}
                                                        isSelected={isSelected}
                                                        isMandatory={false}
                                                        toggleField={toggleField}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* RIGHT SIDE: SELECTED FIELDS (DRAG & DROP) */}
                        <div id="fs-right-pane" className="fs-right-pane flex flex-col h-full min-h-0">
                            <div className="fs-right-header flex-shrink-0 flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-850">
                                <div className="flex items-center gap-2">
                                    <span className="fs-schema-title text-base font-bold text-slate-800 dark:text-slate-100">
                                        {t("Schema Configuration")}
                                    </span>
                                    <span className="bg-[#2374F2] text-white px-2 py-0.5 rounded-full text-xs font-bold shadow-sm">
                                        {t("{{count}} Selected", { count: selectedFields.length })}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    className="text-xs font-bold text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-350 focus:outline-none"
                                    onClick={() => setSelectedFields([...mandatoryFields])}
                                >
                                    {t("Clear All")}
                                </button>
                            </div>

                            <div id="fs-selected-dropzone" ref={setDroppableRef} className={`flex flex-col flex-1 min-h-0 rounded-xl transition-all duration-200 ${
                                isOverDroppable ? "bg-blue-500/5 dark:bg-blue-500/10 border-2 border-dashed border-[#2374F2]" : "border-2 border-transparent"
                            }`}>
                                <div className={`fs-selected-empty border border-dashed rounded-xl p-6 flex flex-col items-center justify-center mb-4 min-h-[100px] flex-shrink-0 transition-colors ${
                                    isOverDroppable ? "border-[#2374F2] text-[#2374F2]" : "border-slate-200 dark:border-slate-850 text-slate-400 dark:text-slate-500"
                                }`}>
                                    <AddCircleOutline className="h-6 w-6 mb-2 opacity-60" />
                                    <span className="text-xs font-bold">{t("Drop more fields here")}</span>
                                </div>

                                <div id="fs-selected-list" className="fs-selected-list flex-1 overflow-y-auto pr-1">
                                    <SortableContext items={selectedFields.map(f => f.key)} strategy={verticalListSortingStrategy}>
                                        <div className="flex flex-col gap-3">
                                            {selectedFields.map((field) => {
                                                const isMandatory = mandatoryFields.some(m => m.key === field.key);
                                                return (
                                                    <SortableItem
                                                        key={field.key}
                                                        field={field}
                                                        isMandatory={isMandatory}
                                                        toggleField={toggleField}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </SortableContext>
                                </div>
                            </div>
                        </div>

                        <DragOverlay>
                            {activeDragField ? (
                                <div className="w-full max-w-[350px] shadow-2xl opacity-90">
                                    <DraggableFieldCard
                                        field={activeDragField}
                                        isSelected={false}
                                        isMandatory={false}
                                        toggleField={() => { }}
                                    />
                                </div>
                            ) : null}
                        </DragOverlay>
                    </div>
                </DndContext>
            </div>
        </div>
    );
}
