import React from 'react';
import { useTranslation } from 'react-i18next';
import { CopySimple, ListPlus, ArrowLeft } from "@phosphor-icons/react";

export const RuleWizardChoosePath = ({
  title = "Create New Rule",
  description = "Automation helps you optimize your ad spend 24/7. Select how you want to start building your optimization logic.",
  templateCardTitle = "Browse Templates",
  templateCardDesc = "Choose from pre-configured rules.",
  scratchCardTitle = "Build Custom Rule",
  scratchCardDesc = "Create a blank rule and define your own conditions and actions from the ground up.",
  onSelectTemplates,
  onSelectScratch
}) => {
  const { t } = useTranslation();

  return (
    <div className={`flex flex-col h-full min-h-[400px]`}>
      <div className="!p-8 !pb-12 !bg-slate-50 dark:!bg-[#0f172a] flex-1">
        <div className="text-center !mb-8">
          <div className="inline-flex items-center !gap-2 !mb-2">
            <div className="!h-[2px] !w-8 !bg-blue-600 !rounded-full"></div>
            <div className="!h-[2px] !w-8 !bg-slate-200 dark:!bg-slate-700 !rounded-full"></div>
          </div>
          <div className="!text-[11px] !font-bold !text-blue-600 !uppercase !tracking-widest !mb-4">{t("Step 1 of 2")}</div>
          <h2 className="!text-2xl !font-bold !text-slate-800 dark:!text-white !mb-3">{t(title)}</h2>
          <p className="!text-slate-500 dark:!text-slate-400 !max-w-md !mx-auto !text-[14px]">
            {t(description)}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row !gap-6 !max-w-3xl !w-full !mx-auto">
          <div 
            id="rule-wizard-templates-card"
            onClick={onSelectTemplates}
            className="flex-1 !bg-white dark:!bg-slate-800/50 !border !border-slate-200 dark:!border-slate-700 !rounded-2xl !p-6 cursor-pointer hover:!border-blue-500 dark:hover:!border-blue-400 hover:!shadow-lg transition-all group"
          >
            <div className="!w-12 !h-12 !rounded-xl !bg-blue-100 dark:!bg-blue-900/30 flex items-center justify-center !mb-5 group-hover:scale-110 transition-transform">
              <CopySimple weight="duotone" className="!w-6 !h-6 !text-blue-600 dark:!text-blue-400" />
            </div>
            <h3 className="!font-bold !text-lg !text-slate-800 dark:!text-white !mb-2">{t(templateCardTitle)}</h3>
            <p className="!text-slate-500 dark:!text-slate-400 !text-sm !mb-6 !leading-relaxed">
              {t(templateCardDesc)}
            </p>
            <div className="!text-blue-600 dark:!text-blue-400 !font-semibold !text-sm flex items-center !gap-2">
              {t("Start from a Template")} <span className="!text-lg !leading-none">&rarr;</span>
            </div>
          </div>

          <div 
            id="rule-wizard-scratch-card"
            onClick={onSelectScratch}
            className="flex-1 !bg-white dark:!bg-slate-800/50 !border !border-slate-200 dark:!border-slate-700 !rounded-2xl !p-6 cursor-pointer hover:!border-emerald-500 dark:hover:!border-emerald-400 hover:!shadow-lg transition-all group"
          >
            <div className="!w-12 !h-12 !rounded-xl !bg-slate-100 dark:!bg-slate-700/50 flex items-center justify-center !mb-5 group-hover:scale-110 transition-transform">
              <ListPlus weight="bold" className="!w-6 !h-6 !text-slate-600 dark:!text-slate-300" />
            </div>
            <h3 className="!font-bold !text-lg !text-slate-800 dark:!text-white !mb-2">{t(scratchCardTitle)}</h3>
            <p className="!text-slate-500 dark:!text-slate-400 !text-sm !mb-6 !leading-relaxed">
              {t(scratchCardDesc)}
            </p>
            <div className="!text-emerald-600 dark:!text-emerald-400 !font-semibold !text-sm flex items-center !gap-2">
              {t("Start from Scratch")} <span className="!text-lg !leading-none">&rarr;</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const RuleWizardTemplates = ({
  templates = [],
  onApplyTemplate,
  onBack
}) => {
  const { t } = useTranslation();

  return (
    <div className={`flex flex-col h-full min-h-[400px]`}>
      <div className="!p-8 !pb-12 !bg-slate-50 dark:!bg-[#0f172a] flex-1 relative">
        <button 
          type="button"
          onClick={onBack}
          className="absolute !top-8 !left-8 !text-sm !font-semibold !text-slate-500 hover:!text-blue-600 flex items-center !gap-1 transition-colors"
        >
          <ArrowLeft weight="bold" /> {t("Back")}
        </button>

        <div className="text-center !mb-8 !mt-4">
          <div className="inline-flex items-center !gap-2 !mb-2">
            <div className="!h-[2px] !w-8 !bg-slate-200 dark:!bg-slate-700 !rounded-full"></div>
            <div className="!h-[2px] !w-8 !bg-blue-600 !rounded-full"></div>
          </div>
          <div className="!text-[11px] !font-bold !text-blue-600 !uppercase !tracking-widest !mb-4">{t("Step 2 of 2")}</div>
          <h2 className="!text-2xl !font-bold !text-slate-800 dark:!text-white !mb-3">{t("Select a Template")}</h2>
          <p className="!text-slate-500 dark:!text-slate-400 !max-w-md !mx-auto !text-[14px]">
            {t("Choose a predefined strategy to automatically fill in the optimal conditions for your campaign.")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 !gap-6">
          {templates.map((template) => (
            <div 
              key={template.id}
              onClick={() => onApplyTemplate(template)}
              className="!bg-white dark:!bg-slate-800/50 !border !border-slate-200 dark:!border-slate-700 !rounded-xl !p-5 cursor-pointer hover:!border-blue-500 hover:!shadow-md transition-all flex flex-col"
            >
              <div className="flex items-center !gap-3 !mb-4">
                <div className={`!w-10 !h-10 !rounded-lg flex items-center justify-center ${template.iconBg.split(' ').map(c => `${c}`).join(' ')}`}>
                  <template.icon weight="duotone" className={`!w-5 !h-5 ${template.iconColor.split(' ').map(c => `${c}`).join(' ')}`} />
                </div>
                <h4 className="!font-bold !text-slate-800 dark:!text-white">{t(template.title)}</h4>
              </div>
              <p className="!text-slate-500 dark:!text-slate-400 !text-sm !leading-relaxed flex-1">
                {t(template.description)}
              </p>
              <div className="!mt-4 !pt-4 !border-t !border-slate-100 dark:!border-slate-700 !text-blue-600 dark:!text-blue-400 !text-xs !font-bold !uppercase !tracking-wider">
                {t("Use this template")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
