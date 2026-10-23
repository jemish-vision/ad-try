import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpDown as ImportExportIcon, Upload as FileUploadOutlinedIcon, Download as FileDownloadOutlinedIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import ImportModal from "./ImportModal";
import { AppTooltip } from "../../components/ui/AppTooltip";
import { Button } from "../../components/ui/button";

const ImportExportMenu = ({
  title,
  onExport,
  selectedRows = [],
  onImport,
  permissions = {},
  accept = ".xlsx,.xls",
  style = {},
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [openImport, setOpenImport] = useState(false);

  const closeMenu = () => setOpen(false);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <AppTooltip text={title ? t(title) : t("Import / Export")}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              style={style}
              className="customize-button m-0 gap-0 custom-secondary-btn h-9 w-9 flex items-center justify-center rounded-md transition-all"
            >
              <ImportExportIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </AppTooltip>

        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-40 p-1 bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 shadow-lg text-slate-700 dark:text-slate-200 rounded-[10px]"
        >
          {permissions.export && (
            <div
              onClick={() => {
                closeMenu();
                onExport(selectedRows);
              }}
              style={{ pointerEvents: selectedRows.length === 0 ? "none" : "auto", opacity: selectedRows.length === 0 ? 0.5 : 1 }}
              className="flex items-center gap-2 px-3 py-1.5 text-[13px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer rounded-md transition-colors"
            >
              <FileDownloadOutlinedIcon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <span>{t("Export")}</span>
            </div>
          )}

          {permissions.import && (
            <div
              onClick={() => {
                closeMenu();
                setOpenImport(true);
              }}
              className="flex items-center gap-2 px-3 py-1.5 text-[13px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer rounded-md transition-colors mt-1"
            >
              <FileUploadOutlinedIcon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <span>{t("Import")}</span>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <ImportModal
        open={openImport}
        onClose={() => setOpenImport(false)}
        onSubmit={onImport}
        accept={accept}
        title={title}
      />
    </>
  );
};

export default ImportExportMenu;