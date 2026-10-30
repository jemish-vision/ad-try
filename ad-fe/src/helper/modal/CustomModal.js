// ConfirmationModal.jsx
import React, { useEffect, useRef } from 'react';
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import {
    MdAddCircleOutline,
    MdEdit,
    MdDeleteOutline,
    MdCheckCircleOutline,
    MdPublish,
    MdHistory,
    MdClose,
    MdSave,
    MdUndo,
    MdDeleteSweep,
    MdCampaign,
    MdWarning,
    MdInfoOutline,
    MdBlock,
    MdArchive,
    MdPauseCircleOutline,
    MdRemoveShoppingCart,
    MdArrowForward,
    MdGroupWork,
    MdHelpOutline,
    MdErrorOutline,
    MdSettings
} from "react-icons/md";

const VARIANT_CONFIG = {
    primary: { bg: 'rgba(26, 159, 212, 0.12)', color: '#1A9FD4', border: 'rgba(26, 159, 212, 0.25)', btnClass: 'btn-primary-brand' },
    danger: { bg: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.25)', btnClass: 'btn-danger-brand' },
    warning: { bg: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.25)', btnClass: 'btn-warning-brand' },
    success: { bg: 'rgba(34, 197, 94, 0.12)', color: '#22c55e', border: 'rgba(34, 197, 94, 0.25)', btnClass: 'btn-success-brand' },
    neutral: { bg: 'rgba(148, 163, 184, 0.12)', color: '#94a3b8', border: 'rgba(148, 163, 184, 0.25)', btnClass: 'btn-neutral-brand' },
};



const ICON_COMPONENT_MAP = {
    add: MdAddCircleOutline,
    add_circle_outline: MdAddCircleOutline,
    edit: MdEdit,
    delete: MdDeleteOutline,
    delete_outline: MdDeleteOutline,
    apply: MdCheckCircleOutline,
    check_circle_outline: MdCheckCircleOutline,
    publish: MdPublish,
    revert: MdHistory,
    history: MdHistory,
    close: MdClose,
    save: MdSave,
    cancel: MdUndo,
    bulk: MdDeleteSweep,
    campaign: MdCampaign,
    warning: MdWarning,
    info: MdInfoOutline,
    block: MdBlock,
    archive: MdArchive,
    pause_circle_outline: MdPauseCircleOutline,
    remove_shopping_cart: MdRemoveShoppingCart,
    arrow_forward: MdArrowForward,
    group_work: MdGroupWork,
    help: MdHelpOutline,
    help_outline: MdHelpOutline,
    settings: MdSettings,
};

// ── Removed ConfirmBackdrop as Dialog provides its own overlay ──

function ConfirmationModalInner({
    show,
    onHide,

    // Header
    title = 'Confirm Action',
    subtitle = '',
    icon = 'help_outline',
    iconVariant = 'primary',       // 'primary' | 'danger' | 'warning' | 'success' | 'neutral'

    // Body
    message,                        // string | JSX
    alertText = '',
    alertVariant = 'info',          // 'info' | 'danger' | 'warning'
    children,                       // arbitrary JSX body content

    // Footer buttons — array of { label, variant, icon, onClick, disabled, ghost }
    actions = [],

    // Misc
    closeOnBackdrop = true,
    size = 'md',         // 'sm' | 'md' | 'lg'
    modalId = '',
    style,
}) {
    const { t } = useTranslation();
    const firstBtnRef = useRef(null);

    useEffect(() => {
        if (show && firstBtnRef.current) firstBtnRef.current.focus();
    }, [show]);

    const variantStyles = VARIANT_CONFIG[iconVariant] || VARIANT_CONFIG.primary;
    const alertStyles = VARIANT_CONFIG[alertVariant] || VARIANT_CONFIG.primary;

    if (!show) return null;

    const maxWidthClass = size === 'sm' ? 'sm:max-w-[380px]' : size === 'xl' ? 'sm:max-w-[950px]' : size === 'lg' ? 'sm:max-w-[700px]' : 'sm:max-w-[460px]';

    let displayMessage = message;
    if (typeof message === 'string') {
        const delRuleMatch = message.match(/^Are you sure want to delete <b>\((.*?)\)<\/b> this rule\?$/i);
        if (delRuleMatch) {
            displayMessage = t("Are you sure want to delete ({{name}}) this rule?", { name: delRuleMatch[1] });
        } else {
            const statusRuleMatch = message.match(/^Are you sure want to change status of <b>\((.*?)\)<\/b> this rule\?$/i);
            if (statusRuleMatch) {
                displayMessage = t("Are you sure want to change status of ({{name}}) this rule?", { name: statusRuleMatch[1] });
            } else {
                const delRecMatch = message.match(/^Are you sure want to delete <b>\((.*?)\)<\/b> this recommendation\?$/i);
                if (delRecMatch) {
                    displayMessage = t("Are you sure want to delete ({{name}}) this recommendation?", { name: delRecMatch[1] });
                }
            }
        }
    }

    return (
        <Dialog open={show} onOpenChange={(open) => { if (!open && closeOnBackdrop) onHide(); }}>
            <DialogContent
                id={modalId}
                style={style}
                className={`cm-confirm-dialog p-0 border-0 flex flex-col gap-0 overflow-hidden ${maxWidthClass}`}
                onInteractOutside={(e) => { if (!closeOnBackdrop) e.preventDefault(); }}
                onEscapeKeyDown={(e) => { if (!closeOnBackdrop) e.preventDefault(); }}
                onFocusOutside={(e) => e.preventDefault()}
                onPointerDownOutside={(e) => {
                    if (e.target?.tagName === 'INPUT' && e.target?.type === 'date') return;
                    if (!closeOnBackdrop) e.preventDefault();
                }}
                hideCloseButton={true}
            >
                {/* Header */}
                <div className="cm-header flex items-center gap-3.5 px-6 py-4.5 border-b border-slate-100 dark:border-white/10 shrink-0">
                    <div className="cm-icon-wrap w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border" style={{ background: variantStyles.bg, color: variantStyles.color, borderColor: variantStyles.border || 'transparent' }}>
                        {(() => {
                            const IconComponent = ICON_COMPONENT_MAP[icon] || MdHelpOutline;
                            return <IconComponent size={20} style={{ display: 'inline-block' }} />;
                        })()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <DialogTitle className="cm-title text-base font-bold text-slate-900 dark:text-white leading-snug" id="cm-modal-title">{typeof title === 'string' ? t(title) : title}</DialogTitle>
                        {subtitle && <p className="cm-subtitle text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-normal">{typeof subtitle === 'string' ? t(subtitle) : subtitle}</p>}
                    </div>
                    <Button variant="ghost" size="icon" className="cm-close-btn h-8 w-8 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0" onClick={onHide} aria-label="Close">
                        <MdClose size={18} />
                    </Button>
                </div>

                {/* Body */}
                <div className="cm-body px-6 py-5 flex-1">
                    {displayMessage && (
                        <p
                            className="cm-message text-sm text-slate-600 dark:text-slate-300 font-medium leading-relaxed m-0"
                            dangerouslySetInnerHTML={
                                typeof displayMessage === 'string' ? { __html: displayMessage } : undefined
                            }
                        >
                            {typeof displayMessage !== 'string' ? displayMessage : undefined}
                        </p>
                    )}

                    {alertText && (
                        <div
                            className="cm-alert-box"
                            style={{
                                background: alertStyles.bg,
                                color: alertStyles.color,
                                borderLeft: `3px solid ${alertStyles.color}`,
                            }}
                        >
                            {(() => {
                                if (alertVariant === 'danger') return <MdErrorOutline size={18} style={{ display: 'inline-block' }} />;
                                if (alertVariant === 'warning') return <MdWarning size={18} style={{ display: 'inline-block' }} />;
                                return <MdInfoOutline size={18} style={{ display: 'inline-block' }} />;
                            })()}
                            <span>{typeof alertText === 'string' ? t(alertText) : alertText}</span>
                        </div>
                    )}

                    {children}
                </div>

                {/* Footer */}
                {actions && actions.length > 0 && (
                    <div className="cm-footer px-6 py-4 flex items-center justify-end gap-2.5 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] shrink-0">
                        {actions.map((action, i) => {
                            let btnVariant = "default";
                            if (action.ghost) btnVariant = "ghost";
                            else if (action.cancel) btnVariant = "outline";
                            else if (action.variant === "danger") btnVariant = "destructive";
                            else if (action.variant === "secondary") btnVariant = "secondary";

                            return (
                                <Button
                                    key={i}
                                    ref={i === 0 ? firstBtnRef : null}
                                    variant={btnVariant}
                                    className={`h-9 px-4 rounded-xl text-xs sm:text-sm font-semibold gap-2 transition-all ${action.cancel ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 shadow-xs' : action.variant === 'danger' ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-xs' : ''}`}
                                    onClick={action.onClick}
                                    disabled={action.disabled || action.loading}
                                >
                                    {action.loading ? (
                                        <i className="fa fa-spinner fa-spin mr-1.5" />
                                    ) : (
                                        action.icon && action.icon !== 'close' && (() => {
                                            const ActionIcon = ICON_COMPONENT_MAP[action.icon] || MdHelpOutline;
                                            return <ActionIcon size={15} />;
                                        })()
                                    )}
                                    {action.label}
                                </Button>
                            );
                        })}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

// ── Public export — zero changes needed in any consumer component ──
export function CustomModal(props) {
    if (typeof document === 'undefined') return null;
    return <ConfirmationModalInner {...props} />;
}