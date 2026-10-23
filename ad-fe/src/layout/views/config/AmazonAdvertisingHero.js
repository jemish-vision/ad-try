import { CheckCircle, Lock, ShieldCheck, Globe, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { useState } from "react";
import Toast from "../../../common/helper/toast/Toast";
import { ApiAmazonAuthConfig } from "../../../api-wrapper/ApiAdsConfig";

const FLAGS = [
    { code: "us", name: "United States" },
    { code: "gb", name: "United Kingdom" },
    { code: "ca", name: "Canada" },
    { code: "ae", name: "United Arab Emirates" },
    { code: "in", name: "India" },
    { code: "au", name: "Australia" },
    { code: "jp", name: "Japan" },
    { code: "mx", name: "Mexico" },
    { code: "de", name: "Germany" },
    { code: "fr", name: "France" },
    { code: "es", name: "Spain" },
    { code: "it", name: "Italy" },
    { code: "nl", name: "Netherlands" },
    { code: "se", name: "Sweden" },
    { code: "pl", name: "Poland" },
    { code: "tr", name: "Turkey" },
    { code: "br", name: "Brazil" },
    { code: "sa", name: "Saudi Arabia" },
    { code: "eg", name: "Egypt" }
];

export default function AmazonAdvertisingHero({ userId, onLinkAccount }) {
    const { t } = useTranslation();

    return (
        <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200/50 dark:border-slate-800 shadow-2xl bg-white dark:bg-slate-950 font-sans transition-all duration-300">
            {/* Ambient Background Glows */}
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-gradient-radial from-[#1A9FD4]/10 dark:from-[#2374F2]/15 to-transparent blur-3xl pointer-events-none -z-10" />
            <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gradient-radial from-[#2374F2]/5 dark:from-[#1A9FD4]/10 to-transparent blur-3xl pointer-events-none -z-10" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 p-8 lg:p-14 relative z-10 items-stretch">
                
                {/* Left Content Column */}
                <div className="lg:col-span-7 flex flex-col justify-between space-y-8">
                    
                    <div className="space-y-6">
                        {/* Premium Partner Badge */}
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-sky-500/10 to-[#2374F2]/10 border border-sky-500/20 text-xs font-bold text-[#1A9FD4] tracking-wide uppercase select-none animate-pulse">
                            <ShieldCheck className="h-4 w-4 text-[#1A9FD4]" />
                            <span>Official Partner API</span>
                        </div>

                        {/* Title and Subtitle */}
                        <div className="space-y-4">
                            <h1 className="text-3xl lg:text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-[1.15] bg-clip-text bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 dark:from-white dark:via-slate-200 dark:to-slate-400">
                                {t("advertising.title")}
                            </h1>
                            <p className="text-sm lg:text-base text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                                {t("advertising.description.line1")} {t("advertising.description.line2")}
                            </p>
                        </div>

                        {/* Features List with customized checkmark badges */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                            {[
                                "advertising.feature.automation",
                                "advertising.feature.security",
                                "advertising.feature.approved"
                            ].map(key => (
                                <div key={key} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50/50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/80 transition-all hover:shadow-md hover:border-slate-200 dark:hover:border-slate-700/60">
                                    <div className="p-1 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 shrink-0">
                                        <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    </div>
                                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 leading-tight">{t(key)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* CTA Actions and Secure Badge */}
                    <div className="flex flex-col gap-6 pt-6 border-t border-slate-100 dark:border-slate-800/80">
                        <div className="flex items-center gap-4">
                            <Button
                                onClick={() => {
                                    if (onLinkAccount) {
                                        onLinkAccount();
                                    } else {
                                        // Fallback click helper
                                        const linkBtn = document.getElementById("ads-config-link-btn");
                                        if (linkBtn) linkBtn.click();
                                    }
                                }}
                                className="h-11 px-8 font-bold text-xs uppercase tracking-wider rounded-xl bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] hover:opacity-90 transform transition-all text-white border-0 focus:outline-none flex items-center justify-center gap-2 whitespace-nowrap shadow-md active:scale-[0.98]"
                            >
                                <span>Link your account</span>
                                <ArrowRight className="h-4 w-4" />
                            </Button>

                            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-50/50 dark:bg-slate-900/30 border border-slate-150 dark:border-slate-800/50 w-fit">
                                <Lock className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-bold tracking-wide">
                                    {t("advertising.privacy")}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Visual interactive Region Globe Card */}
                <div className="lg:col-span-5 flex flex-col justify-between">
                    <div className="relative h-full flex flex-col justify-between p-6 lg:p-8 rounded-2xl bg-gradient-to-b from-slate-50/50 to-slate-50 dark:from-slate-900/30 dark:to-slate-900/60 border border-slate-200/50 dark:border-slate-800/80 shadow-lg space-y-6">
                        
                        {/* Region Card Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-sky-500/10 text-[#1A9FD4] shrink-0">
                                    <Globe className="h-4 w-4" />
                                </div>
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    {t("advertising.supportedCountries")}
                                </span>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1A9FD4]/10 dark:bg-[#2374F2]/20 text-[#1A9FD4] dark:text-[#5B9CF6]">
                                {FLAGS.length} REGIONS
                            </span>
                        </div>

                        {/* Regions Flag Grid */}
                        <div className="grid grid-cols-5 gap-3">
                            {FLAGS.map(flag => (
                                <div 
                                    key={flag.code} 
                                    className="group relative flex items-center justify-center p-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-700/60 shadow-sm hover:border-[#1A9FD4] hover:shadow-md hover:scale-105 transition-all duration-250 cursor-pointer"
                                    title={flag.name}
                                >
                                    <img
                                        src={`https://countryflagsapi.netlify.app/flag/${flag.code}.svg`}
                                        alt={flag.name}
                                        className="w-7 h-7 object-cover rounded-full border border-slate-100 dark:border-slate-900 filter saturate-90 hover:saturate-120 transition-all"
                                    />
                                    {/* Tooltip glow element */}
                                    <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-slate-950 text-white text-[10px] font-bold rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20">
                                        {flag.name}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Official Badge Footer */}
                        <div className="pt-4 flex items-center justify-between gap-4 border-t border-slate-200/60 dark:border-slate-800/60 text-xs text-slate-400 dark:text-slate-500 font-bold shrink-0">
                            <span>{t("advertising.approvedBy")}</span>
                            <img 
                                src="https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg" 
                                alt="Amazon Advertising" 
                                className="h-5 w-auto object-contain opacity-90 dark:invert transition-all hover:opacity-100" 
                            />
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
