import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "../../../../components/ui/dialog";
import { Button } from "../../../../components/ui/button";
import { FiExternalLink, FiCopy, FiCheck, FiInfo } from "react-icons/fi";

const AMAZON_HELP_URLS = {
    IN: "https://sellercentral.amazon.in/help/center?redirectSource=Hill",
    US: "https://sellercentral.amazon.com/help/center?redirectSource=Hill",
    UK: "https://sellercentral.amazon.co.uk/help/center?redirectSource=Hill",
    DE: "https://sellercentral.amazon.de/help/center?redirectSource=Hill",
    FR: "https://sellercentral.amazon.fr/help/center?redirectSource=Hill",
    IT: "https://sellercentral.amazon.it/help/center?redirectSource=Hill",
    ES: "https://sellercentral.amazon.es/help/center?redirectSource=Hill",
    CA: "https://sellercentral.amazon.ca/help/center?redirectSource=Hill",
    JP: "https://sellercentral.amazon.co.jp/help/center?redirectSource=Hill",
    AU: "https://sellercentral.amazon.com.au/help/center?redirectSource=Hill",
    AE: "https://sellercentral.amazon.ae/help/center?redirectSource=Hill",
};

const getHelpUrl = (marketplace) =>
    AMAZON_HELP_URLS[marketplace?.toUpperCase()] || AMAZON_HELP_URLS.IN;

// ── CopyRow ────────────────────────────────────────────────────────────────────
function CopyRow({ label, value, isDark }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(String(value ?? "")).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    return (
        <div className="flex items-center" style={{ gap: 8, background: isDark ? "rgba(255, 255, 255, 0.02)" : "#f9fafb", border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "0.5px solid #e5e7eb", borderRadius: 7, padding: "7px 10px", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: isDark ? "rgba(255, 255, 255, 0.5)" : "#6b7280", minWidth: 65, flexShrink: 0 }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: isDark ? "rgba(255, 255, 255, 0.9)" : "#111827", fontFamily: "monospace", flex: 1, wordBreak: "break-all" }}>
                {value || "--"}
            </span>
            <Button
                variant="ghost"
                onClick={handleCopy}
                className="flex items-center gap-1.5 h-[26px] px-2.5 rounded text-[11px] font-semibold border transition-colors duration-150"
                style={{
                    background: isDark ? "rgba(255, 255, 255, 0.05)" : "#f1f5f9",
                    borderColor: isDark ? "rgba(255, 255, 255, 0.15)" : "#cbd5e1",
                    color: isDark ? "rgba(255, 255, 255, 0.8)" : "#475569",
                }}
            >
                {copied ? <FiCheck size={12} color="#10b981" /> : <FiCopy size={12} />}
                {copied ? "Copied" : "Copy"}
            </Button>
        </div>
    );
}

// ── CopyDescriptionButton ──────────────────────────────────────────────────────
function CopyDescriptionButton({ text, isDark }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            style={{ background: "none", border: `0.5px solid ${copied ? (isDark ? "#34d399" : "#86efac") : (isDark ? "rgba(59, 130, 246, 0.3)" : "#93c5fd")}`, borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 600, color: copied ? (isDark ? "#34d399" : "#15803d") : (isDark ? "#60a5fa" : "#1d4ed8"), cursor: "pointer", display: "flex", alignItems: "center", gap: 5, marginTop: 8, transition: "all 0.15s" }}
        >
            {copied ? <FiCheck size={12} /> : <FiCopy size={12} />}
            {copied ? "Copied" : "Copy description"}
        </Button>
    );
}

// ── StepRow ────────────────────────────────────────────────────────────────────
function StepRow({ number, title, children, last, isDark }) {
    return (
        <div className="flex items-start" style={{ gap: 14, marginBottom: last ? 0 : 18 }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#1A9FD4", color: "#fff", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                {number}
            </div>
            <div style={{ flex: 1 }}>
                <p style={{ margin: "0 0 5px", fontSize: 13, fontWeight: 600, color: isDark ? "rgba(255, 255, 255, 0.9)" : "#111827" }}>{title}</p>
                {children}
            </div>
        </div>
    );
}

// ── Chip ───────────────────────────────────────────────────────────────────────
function Chip({ children, isDark }) {
    return (
        <span style={{ display: "inline-flex", alignItems: "center", background: isDark ? "rgba(59, 130, 246, 0.15)" : "#eff6ff", border: isDark ? "1px solid rgba(59, 130, 246, 0.3)" : "0.5px solid #93c5fd", borderRadius: 5, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: isDark ? "#60a5fa" : "#1d4ed8", margin: "4px 0", lineHeight: 1.5 }}>
            {children}
        </span>
    );
}

// ── SectionLabel ───────────────────────────────────────────────────────────────
function SectionLabel({ children, top, isDark }) {
    return (
        <p style={{ fontSize: 11, fontWeight: 600, color: isDark ? "rgba(255, 255, 255, 0.4)" : "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", margin: `${top || 0}px 0 8px` }}>
            {children}
        </p>
    );
}

// ── Main Modal ─────────────────────────────────────────────────────────────────
function ReconciliationStepsModal({ show, handleClose, shipmentData, isDark }) {
    const { t } = useTranslation();
    const {
        shipmentId = "",
        sellerSKU = "",
        fnsku = "",
        asin = "",
        quantityShipped = 0,
        quantityReceived = 0,
        marketplace = "IN",
    } = shipmentData || {};

    const missingQty = Math.max(0, Number(quantityShipped) - Number(quantityReceived));
    const helpUrl = getHelpUrl(marketplace);

    const caseDescription = quantityReceived === 0
        ? `Hi, I shipped ${quantityShipped} units of SKU ${sellerSKU} (FNSKU: ${fnsku}) under Shipment ID ${shipmentId}, but no units were received at the fulfillment center. There are ${missingQty} units missing. Please investigate and process the reimbursement for the missing units.`
        : `Hi, I shipped ${quantityShipped} units of SKU ${sellerSKU} (FNSKU: ${fnsku}) under Shipment ID ${shipmentId}, but only ${quantityReceived} units were received at the fulfillment center. There are ${missingQty} units missing. Please investigate and process the reimbursement for the missing units.`;

    const desc = { fontSize: 12, color: isDark ? "rgba(255, 255, 255, 0.6)" : "#6b7280", lineHeight: 1.6, margin: 0 };
    const strong = { fontWeight: 600, color: isDark ? "rgba(255, 255, 255, 0.9)" : "inherit" };

    useEffect(() => {
        if (show) document.body.classList.add("reconciliation-steps-modal");
        else document.body.classList.remove("reconciliation-steps-modal");
        return () => { document.body.classList.remove("reconciliation-steps-modal") };
    }, [show]);

    return (
        <Dialog open={show} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent 
                className="max-w-[800px] p-0 border-0 flex flex-col overflow-hidden max-h-[88vh]"
                style={{
                    background: isDark ? "var(--glass-bg)" : "#fff",
                    boxShadow: isDark ? "0 24px 60px rgba(0,0,0,0.4)" : "0 24px 60px rgba(0,0,0,0.18)",
                }}
            >
                {/* ── HEADER ── */}
                <DialogHeader
                    className="px-6 py-4 flex-shrink-0"
                    style={{ 
                        borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "0.5px solid #e5e7eb", 
                        background: isDark ? "rgba(255, 255, 255, 0.02)" : "#fff"
                    }}
                >
                    <DialogTitle style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 700, color: isDark ? "rgba(255, 255, 255, 0.92)" : "#111827" }}>
                        Apply Reconciliation Claim
                    </DialogTitle>
                    <p style={{ margin: 0, fontSize: 12, color: isDark ? "rgba(255, 255, 255, 0.5)" : "#6b7280" }}>
                        Follow all 8 steps on Amazon Seller Central
                    </p>
                </DialogHeader>

                {/* ── BODY (scrollable) ── */}
                <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>

                    {/* Notice */}
                    <div style={{ background: isDark ? "rgba(245, 158, 11, 0.15)" : "#fef3c7", border: isDark ? "1px solid rgba(245, 158, 11, 0.3)" : "0.5px solid #f59e0b", borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 20 }}>
                        <FiInfo size={15} color="#d97706" style={{ marginTop: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: isDark ? "#fbbf24" : "#92400e", lineHeight: 1.6 }}>
                            We are not able to auto-submit this claim. Please follow the steps below and submit manually on Amazon Seller Central. It only takes 2–3 minutes.
                        </span>
                    </div>

                    {/* ── Step 1 ── */}
                    <StepRow number={1} title={t("Open Amazon Seller Central Help Center")} isDark={isDark}>
                        <p style={desc}>
                            Click <strong style={strong}>"Open Amazon Help Center"</strong> at the bottom of this dialog. It will open in a new tab.
                        </p>
                    </StepRow>

                    {/* ── Step 2 ── */}
                    <StepRow number={2} title='Select "Issues/Questions with creating a shipment"' isDark={isDark}>
                        <p style={{ ...desc, marginBottom: 6 }}>
                            Under <strong style={strong}>"Select common issue or describe yours"</strong>, click:
                        </p>
                        <Chip isDark={isDark}>Issues/Questions with creating a shipment</Chip>
                        <p style={{ ...desc, marginTop: 6 }}>
                            Make sure <strong style={strong}>Store</strong> is your marketplace and <strong style={strong}>Service → Selling on Amazon</strong>.
                        </p>
                    </StepRow>

                    {/* ── Step 3 ── */}
                    <StepRow number={3} title='Select "Troubleshoot issues with an existing shipment"' isDark={isDark}>
                        <p style={{ ...desc, marginBottom: 6 }}>
                            Under <strong style={strong}>"FBA shipment questions — What do you need help with?"</strong>, click:
                        </p>
                        <Chip isDark={isDark}>Troubleshoot issues with an existing shipment (cancel shipment, get refund for labels, receiving/closed statuses, etc.,)</Chip>
                    </StepRow>

                    {/* ── Step 4 ── */}
                    <StepRow number={4} title={t("Select or enter your Shipment ID")} isDark={isDark}>
                        <p style={{ ...desc, marginBottom: 8 }}>
                            If your shipment appears in the grid, click it. If not, click <strong style={strong}>"Shipment ID not in list"</strong> and paste:
                        </p>
                        <CopyRow label="Shipment ID" value={shipmentId} isDark={isDark} />
                    </StepRow>

                    {/* ── Step 5 ── */}
                    <StepRow number={5} title='Click "Contact an associate"' isDark={isDark}>
                        <p style={desc}>
                            After entering the Shipment ID, Amazon shows a resolution page. Scroll to <strong style={strong}>"Did this resolve your issue?"</strong> and click <strong style={strong}>"Contact an associate"</strong>.
                        </p>
                    </StepRow>

                    {/* ── Step 6 ── */}
                    <StepRow number={6} title={t("Fill in ASIN, FNSKU and describe the issue")} isDark={isDark}>
                        <p style={{ ...desc, marginBottom: 10 }}>
                            Under <strong style={strong}>"Contact associates → Additional information"</strong>, fill in the fields below, then click <strong style={strong}>Continue</strong> to submit.
                        </p>

                        <SectionLabel isDark={isDark}>Paste these values into the fields</SectionLabel>
                        <CopyRow label="ASIN" value={asin} isDark={isDark} />
                        <CopyRow label="FNSKU" value={fnsku} isDark={isDark} />

                        <SectionLabel top={12} isDark={isDark}>Paste this into "Additional details about your issue"</SectionLabel>
                        <div style={{ background: isDark ? "rgba(255,255,255,0.02)" : "#f9fafb", border: isDark ? "1px solid rgba(255,255,255,0.08)" : "0.5px solid #e5e7eb", borderRadius: 7, padding: "10px 12px", fontSize: 12, color: isDark ? "rgba(255,255,255,0.8)" : "#374151", lineHeight: 1.7 }}>
                            Hi, I shipped <strong style={strong}>{quantityShipped} units</strong> of SKU{" "}
                            <strong style={strong}>{sellerSKU}</strong> (FNSKU: {fnsku}) under Shipment ID{" "}
                            <strong style={strong}>{shipmentId}</strong>, but{" "}
                            <strong style={strong}>
                                {quantityReceived === 0 ? "no units" : `only ${quantityReceived} units`}
                            </strong>{" "}
                            were received at the fulfillment center. There are{" "}
                            <strong style={{ ...strong, color: isDark ? "#f87171" : "#b91c1c" }}>{missingQty} units missing</strong>.{" "}
                            Please investigate and process the reimbursement for the missing units.
                        </div>
                        <CopyDescriptionButton text={caseDescription} isDark={isDark} />
                    </StepRow>

                    {/* ── Step 7 ── */}
                    <StepRow number={7} title={t("Select your contact method & enter email")} isDark={isDark}>
                        <p style={{ ...desc, marginBottom: 8 }}>
                            On the same form, choose how you want Amazon to contact you:
                        </p>
                        <div className="flex flex-wrap" style={{ gap: 16, marginBottom: 10 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, background: isDark ? "rgba(255,255,255,0.05)" : "#f3f4f6", color: isDark ? "rgba(255,255,255,0.7)" : "inherit", padding: "4px 10px", borderRadius: 5 }}>
                                ☑ E-mail
                            </span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, background: isDark ? "rgba(255,255,255,0.05)" : "#f3f4f6", color: isDark ? "rgba(255,255,255,0.7)" : "inherit", padding: "4px 10px", borderRadius: 5 }}>
                                ☐ Chat (Less than 1-minute wait)
                            </span>
                        </div>
                        <p style={{ ...desc, marginBottom: 6 }}>
                            <strong style={strong}>Your Email:</strong> Enter the email address associated with your Seller Central account.
                        </p>
                        <p style={{ ...desc, marginTop: 8 }}>
                            <strong style={strong}>Optional:</strong> You can also add a phone number for a callback.
                        </p>
                    </StepRow>

                    {/* ── Step 8 ── */}
                    <StepRow number={8} title='Click "Send" or "Continue" to submit your case' last isDark={isDark}>
                        <p style={desc}>
                            After filling in all required fields, click the <strong style={strong}>Send</strong> button (or <strong style={strong}>Continue</strong> depending on your marketplace).
                        </p>
                        <div style={{ background: isDark ? "rgba(59, 130, 246, 0.15)" : "#eff6ff", border: isDark ? "1px solid rgba(59, 130, 246, 0.3)" : "0.5px solid #93c5fd", borderRadius: 7, padding: "10px 14px", marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                            <span style={{ fontSize: 12, color: isDark ? "#60a5fa" : "#1e40af" }}>
                                Amazon will send a confirmation to your email within minutes.
                            </span>
                        </div>
                    </StepRow>

                </div>

                {/* ── FOOTER ── */}
                <DialogFooter 
                    className="px-6 py-3 flex-shrink-0 flex items-center justify-between w-full"
                    style={{ 
                        borderTop: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "0.5px solid #e5e7eb", 
                        background: isDark ? "rgba(255,255,255,0.03)" : "#f9fafb" 
                    }}
                >
                    <Button
                        variant="outline"
                        onClick={handleClose}
                        className="h-[38px] px-6 text-[13px] font-semibold border-transparent"
                        style={{
                            color: isDark ? "rgba(255, 255, 255, 0.6)" : "#64748b",
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        className="h-[38px] px-6 text-[13px] font-semibold flex items-center gap-2"
                        style={{
                            background: "#1A9FD4",
                            color: "#fff",
                            boxShadow: "0 4px 12px rgba(26, 159, 212, 0.25)",
                        }}
                        onClick={() => window.open(helpUrl, "_blank")}
                    >
                        <FiExternalLink size={15} />
                        Open Amazon Help Center
                    </Button>
                </DialogFooter>

            </DialogContent>
        </Dialog>
    );
}

export default ReconciliationStepsModal;