import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { Toast } from "../../../../helper/links/Link";
import { ApiPreviewSDCreative } from "../../../../api-wrapper/campaign/ApiCampaign";
import { ChevronLeft as ArrowBackIosNewIcon, ChevronRight as ArrowForwardIosIcon } from "lucide-react";

// exact sizes mapped
const SIZE_MAPPING = [
  { size: "300x250", label: "300×250 - Medium rectangle" },
  { size: "650x130", label: "650×130 - Amazon product detail page middle" },
  { size: "245x250", label: "245×250 - Amazon product page right" },
  { size: "414x125", label: "414×125 - Amazon mobile pages" },
  { size: "600x160", label: "600×160 - Wide skyscraper" },
  { size: "160x600", label: "160×600 - Wide skyscraper" },
  { size: "600x300", label: "600×300 - Large rectangle" },
  { size: "300x600", label: "300×600 - Half page" },
  { size: "728x90", label: "728×90 - Leaderboard" },
  { size: "980x55", label: "980×55 - Amazon top stripe" },
  { size: "320x50", label: "320×50 - Mobile leaderboard" },
  { size: "970x250", label: "970×250 - Billboard" },
  { size: "270x150", label: "270×150 - Amazon product detail page middle" },
  { size: "970x66", label: "970×66 - Amazon top stripe (slim)" },
  { size: "320x480", label: "320×480 - Mobile interstitial" },
];

const CreativeModal = (props) => {
  const { t } = useTranslation();
  const show = props.show !== undefined ? props.show : props.showModal;
  const onHide = props.onHide || (() => props.setShowModal?.(false));
  const { campaignId, isDark = false } = props;
  const [loading, setLoading] = useState(false);
  const [previews, setPreviews] = useState([]);
  const [selectedSize, setSelectedSize] = useState("");

  const getPreviews = async () => {
    try {
      setLoading(true);
      const res = await ApiPreviewSDCreative({ campaignId });
      if (res?.isSuccess) {
        const data = res.data || [];
        setPreviews(data);
        if (data.length > 0) {
          const firstSizeStr = `${data[0].size.width}x${data[0].size.height}`;
          setSelectedSize(firstSizeStr);
        }
      } else {
        Toast.error(res?.message || t("Failed to fetch creative previews"));
      }
    } catch (err) {
      console.error(err);
      Toast.error(t("An error occurred while fetching previews"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (show && campaignId) {
      getPreviews();
    } else {
      setPreviews([]);
      setSelectedSize("");
    }
  }, [show, campaignId]);

  const selectedPreview = previews.find(
    p => `${p.size.width}x${p.size.height}` === selectedSize
  );

  const handleNext = () => {
    const currentIndex = previews.findIndex(
      p => `${p.size.width}x${p.size.height}` === selectedSize
    );
    if (currentIndex < previews.length - 1) {
      const next = previews[currentIndex + 1];
      setSelectedSize(`${next.size.width}x${next.size.height}`);
    }
  };

  const handlePrev = () => {
    const currentIndex = previews.findIndex(
      p => `${p.size.width}x${p.size.height}` === selectedSize
    );
    if (currentIndex > 0) {
      const prev = previews[currentIndex - 1];
      setSelectedSize(`${prev.size.width}x${prev.size.height}`);
    }
  };

  return (
    <Dialog open={show} onOpenChange={(open) => !open && onHide()}>
      <DialogContent
        className="max-w-[1100px] w-[95vw] p-0 rounded-[20px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/95 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col max-h-[90vh] font-sans"
        onInteractOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Glow Line Indicator */}
        <div
          className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
          style={{
            background: "linear-gradient(90deg, transparent 0%, #1a9fd4 30%, #2374f2 70%, transparent 100%)",
            opacity: 0.8
          }}
        />

        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 dark:border-white/10 shrink-0">
          <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
            {t("Sponsored Display Creatives")}
          </DialogTitle>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-4 bg-slate-50/50 dark:bg-white/5 max-h-[calc(90vh-140px)]">
          {loading ? (
            <div className="flex justify-center items-center min-h-[400px]">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-sky-500 border-t-transparent" />
                <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">{t("Loading previews...")}</span>
              </div>
            </div>
          ) : previews.length === 0 ? (
            <div className="flex justify-center items-center min-h-[400px] text-xs font-semibold text-slate-400 dark:text-slate-500">
              {t("No creatives found for this campaign.")}
            </div>
          ) : (
            <div className="flex flex-col gap-4 h-full">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h5 className="text-sm font-bold text-slate-800 dark:text-slate-200">{t("Creative Preview")}</h5>
                <div className="w-full md:w-[320px] flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t("Key Ad Sizes")}</label>
                  <select
                    value={selectedSize}
                    onChange={(e) => setSelectedSize(e.target.value)}
                    className="w-full h-9 px-3 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-transparent text-slate-900 dark:text-white"
                  >
                    <option value="" disabled>{t("Select ad size")}</option>
                    {SIZE_MAPPING.map(mapping => {
                      const hasPreview = previews.some(p => `${p.size.width}x${p.size.height}` === mapping.size);
                      if (hasPreview) {
                        const [sizeStr, labelStr] = mapping.label.split(" - ");
                        return (
                          <option key={mapping.size} value={mapping.size}>
                            {sizeStr} - {t(labelStr)}
                          </option>
                        );
                      }
                      return null;
                    })}
                    {previews.map(p => {
                      const sizeStr = `${p.size.width}x${p.size.height}`;
                      const isMapped = SIZE_MAPPING.some(m => m.size === sizeStr);
                      if (!isMapped) {
                        const displaySize = sizeStr.replace('x', '×');
                        return (
                          <option key={sizeStr} value={sizeStr}>
                            {displaySize} - {t("Other layout")}
                          </option>
                        );
                      }
                      return null;
                    })}
                  </select>
                </div>
              </div>

              {/* Preview Box Container */}
              <div className="relative flex-grow bg-slate-950/90 dark:bg-slate-950 border border-slate-200/50 dark:border-slate-800/80 rounded-xl shadow-inner flex items-center justify-center min-h-[500px] overflow-hidden">
                <div className="absolute left-4 z-10">
                  <button
                    type="button"
                    onClick={handlePrev}
                    disabled={previews.findIndex(p => `${p.size.width}x${p.size.height}` === selectedSize) <= 0}
                    className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-900/60 hover:bg-slate-900/80 text-white disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 shadow-lg border border-white/5"
                  >
                    <ArrowBackIosNewIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex justify-center items-center w-full h-full p-6 overflow-auto">
                  {selectedPreview ? (
                    <div style={{
                      width: selectedPreview.size.width,
                      height: selectedPreview.size.height,
                      position: "relative",
                      boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.3)",
                      borderRadius: "6px",
                      overflow: "hidden",
                      background: "#fff",
                      flexShrink: 0,
                      transition: "all 0.3s ease"
                    }}>
                      <iframe
                        title={t("Creative Preview")}
                        srcDoc={selectedPreview.preview}
                        style={{
                          width: "100%",
                          height: "100%",
                          border: "none",
                          display: "block"
                        }}
                      />
                    </div>
                  ) : (
                    <div className="text-slate-500 text-xs font-semibold">{t("Select an ad size to see the preview.")}</div>
                  )}
                </div>

                <div className="absolute right-4 z-10">
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={previews.findIndex(p => `${p.size.width}x${p.size.height}` === selectedSize) >= previews.length - 1}
                    className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-900/60 hover:bg-slate-900/80 text-white disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 shadow-lg border border-white/5"
                  >
                    <ArrowForwardIosIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreativeModal;
