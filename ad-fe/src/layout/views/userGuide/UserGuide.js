import React, { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Compass, LayoutDashboard, Megaphone, MousePointerClick, CircleDollarSign, Sparkles,
  Target, Search, Package, Clock, RefreshCw, Calendar, History,
  Settings, Users, CreditCard, Ban, Headphones,
  Shield, Timer, Link, Store, Calculator,
  User, ShieldAlert, FileText, ArrowUp, HelpCircle
} from "lucide-react";
import { userGuideSections } from "./UserGuideContent";
import "./UserGuide.css";
import Filter from "../../../helper/filter/Filter";

// Icon mapping for dynamic rendering
const IconMap = {
  Explore: Compass,
  Dashboard: LayoutDashboard,
  Campaign: Megaphone,
  AdsClick: MousePointerClick,
  MonetizationOn: CircleDollarSign,
  AutoAwesome: Sparkles,
  TrackChanges: Target,
  Search: Search,
  Inventory: Package,
  Schedule: Clock,
  Sync: RefreshCw,
  Event: Calendar,
  History: History,
  Settings: Settings,
  People: Users,
  CardMembership: CreditCard,
  Block: Ban,
  SupportAgent: Headphones,
  Security: Shield,
  Timer: Timer,
  Link: Link,
  Store: Store,
  Calculate: Calculator
};

const UserGuide = () => {
  const { t } = useTranslation();
  const [activeRole, setActiveRole] = useState("client");

  const ROLE_CONFIG = useMemo(() => ({
    client: {
      label: t("Seller Panel"),
      icon: <User className="h-4 w-4" />,
      description: t("Campaign management, analytics, and optimization tools")
    }
  }), [t]);
  const [activeSection, setActiveSection] = useState(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const sectionRefs = useRef({});
  const mainContentRef = useRef(null);
  const sidebarRef = useRef(null);

  // Filter sections by active role
  const roleSections = useMemo(() => {
    return userGuideSections.filter(s =>
      !s.role || s.role === "all" || s.role === activeRole
    );
  }, [activeRole]);

  // Set initial active section when role changes
  useEffect(() => {
    if (roleSections.length > 0) {
      setActiveSection(roleSections[0].id);
    }
  }, [activeRole, roleSections]);

  // Handle scroll events for progress bar and active section highlighting
  useEffect(() => {
    const scrollContainer = document.querySelector('.outlet_wrapper');

    const handleScroll = () => {
      let scrollY = 0;
      let height = 0;

      if (scrollContainer) {
        scrollY = scrollContainer.scrollTop;
        height = scrollContainer.scrollHeight - scrollContainer.clientHeight;
      } else {
        scrollY = window.scrollY || document.documentElement.scrollTop;
        height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      }

      setShowBackToTop(scrollY > 500);

      // Progress bar
      const scrolled = height > 0 ? (scrollY / height) * 100 : 0;
      setScrollProgress(scrolled);

      // Active section detection
      const offsets = roleSections.map(section => {
        const el = sectionRefs.current[section.id];
        if (!el) return { id: section.id, offset: 0 };

        let offset = 0;
        if (scrollContainer) {
          offset = el.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top + scrollY - 150;
        } else {
          offset = el.getBoundingClientRect().top + scrollY - 150;
        }

        return { id: section.id, offset: offset };
      });

      const current = offsets.reverse().find(o => scrollY >= o.offset);
      if (current && activeSection !== current.id) {
        setActiveSection(current.id);
      }

      // Dynamic Sidebar Height calculation to prevent off-screen bottom overflow
      if (sidebarRef.current) {
        const rect = sidebarRef.current.getBoundingClientRect();
        const availableHeight = window.innerHeight - Math.max(72, rect.top) - 40;
        sidebarRef.current.style.setProperty('--sidebar-max-height', `${availableHeight}px`);
      }
    };

    if (scrollContainer) {
      scrollContainer.addEventListener("scroll", handleScroll);
      handleScroll(); // Initial calc
      return () => scrollContainer.removeEventListener("scroll", handleScroll);
    } else {
      window.addEventListener("scroll", handleScroll);
      handleScroll(); // Initial calc
      return () => window.removeEventListener("scroll", handleScroll);
    }
  }, [activeSection, roleSections]);

  const scrollToSection = (id) => {
    const element = sectionRefs.current[id];
    if (element) {
      const scrollContainer = document.querySelector('.outlet_wrapper');
      if (scrollContainer) {
        const offset = 100;
        const containerRect = scrollContainer.getBoundingClientRect().top;
        const elementRect = element.getBoundingClientRect().top;
        const elementPosition = elementRect - containerRect;
        const offsetPosition = elementPosition + scrollContainer.scrollTop - offset;

        scrollContainer.scrollTo({
          top: offsetPosition,
          behavior: "smooth"
        });
      } else {
        // Fallback
        const offset = 100;
        const bodyRect = document.body.getBoundingClientRect().top;
        const elementRect = element.getBoundingClientRect().top;
        const elementPosition = elementRect - bodyRect;
        const offsetPosition = elementPosition - offset;

        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth"
        });
      }
      setActiveSection(id);
    }
  };

  const handlePrintPdf = () => {
    window.print();
  };

  const scrollToTop = () => {
    const scrollContainer = document.querySelector('.outlet_wrapper');
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleRoleChange = (role) => {
    setActiveRole(role);
    scrollToTop();
  };

  const parseInlineMarkdown = (text) => {
    if (!text) return null;
    
    // 1. Try translating the full line first
    let translatedText = t(text);

    // 2. If full line did not match a key, fallback: try translating full line without list prefix
    if (translatedText === text) {
      const strippedText = text.replace(/^(\d+\.\s*|- \s*)/, "");
      const strippedTranslation = t(strippedText);
      if (strippedTranslation !== strippedText) {
        const numPrefix = text.match(/^(\d+\.\s*)/);
        translatedText = numPrefix ? `${numPrefix[1]}${strippedTranslation}` : strippedTranslation;
      }
    }

    // 3. Split translated string by bold markers **...**
    const parts = translatedText.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) => {
      if (!part) return null;
      let finalPart = part;
      if (translatedText === text) {
        finalPart = t(part);
      }
      return i % 2 === 1 ? <strong key={i}>{finalPart}</strong> : finalPart;
    });
  };

  const renderTextContent = (text) => {
    return text.split("\n").map((line, index) => {
      if (!line.trim()) return null;

      const indentMatch = line.match(/^(\s+)/);
      const isIndented = indentMatch && indentMatch[0].length >= 2;
      const trimmedLine = line.trim();

      // Collage / Multiple Images
      const isSmallImage = trimmedLine.includes("{small}");
      const cleanImgLine = trimmedLine.replace("{small}", "").trim();
      const imgMatches = [...cleanImgLine.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
      if (imgMatches.length > 0) {
        return (
          <div key={index} className={`ug-doc-image-wrapper ${imgMatches.length > 1 ? 'collage' : ''} ${isSmallImage ? 'small' : ''}`}>
            <div className="ug-doc-image-grid">
              {imgMatches.map((match, i) => (
                <div key={i} className="ug-doc-image-item">
                  <img src={match[2]} alt={match[1]} />
                  {match[1] && <span className="ug-doc-image-caption">{t(match[1])}</span>}
                </div>
              ))}
            </div>
          </div>
        );
      }

      if (trimmedLine.startsWith("## ")) {
        return <h2 key={index} className="ug-doc-h2">{parseInlineMarkdown(trimmedLine.replace("## ", ""))}</h2>;
      }
      if (trimmedLine.startsWith("### ")) {
        return <h3 key={index} className="ug-doc-h3">{parseInlineMarkdown(trimmedLine.replace("### ", ""))}</h3>;
      }
      if (trimmedLine.startsWith("#### ")) {
        return <h4 key={index} className="ug-doc-h4">{parseInlineMarkdown(trimmedLine.replace("#### ", ""))}</h4>;
      }

      if (trimmedLine.startsWith("> Tip:") || trimmedLine.startsWith("> Note:") || trimmedLine.startsWith("> ")) {
        const isTip = trimmedLine.startsWith("> Tip:");
        const textContent = trimmedLine.replace(/^> (Tip:|Note:|)\s*/, "");
        return (
          <div key={index} className={`ug-doc-callout ${isTip ? 'tip' : 'info'}`}>
            <span className="ug-doc-callout-icon"><HelpCircle className="h-4 w-4" /></span>
            <div className="ug-doc-callout-text">
              {parseInlineMarkdown(textContent)}
            </div>
          </div>
        );
      }

      if (trimmedLine.startsWith("- ")) {
        const content = trimmedLine.replace("- ", "");
        return (
          <ul key={index} className={`ug-doc-list ${isIndented ? 'nested' : ''}`}>
            <li>{parseInlineMarkdown(content)}</li>
          </ul>
        );
      }

      const numMatch = trimmedLine.match(/^(\d+)\.\s*(.*)/);
      if (numMatch) {
        return (
          <ul key={index} className={`ug-doc-list ${isIndented ? 'nested' : ''}`}>
            <li>{parseInlineMarkdown(trimmedLine)}</li>
          </ul>
        );
      }

      return (
        <p key={index} className="ug-doc-paragraph">
          {parseInlineMarkdown(trimmedLine)}
        </p>
      );
    });
  };

  return (
    <>
      <Filter name={"User Guide"} nameShow={false} dateShow={false} profileShow={true} />
      <div className="ug-root">
        {/* Progress Bar */}
        <div className="ug-progress-bar no-print" style={{ width: `${scrollProgress}%` }} />

      <div className="ug-wrapper">
        {/* Cover Header */}
        <header className="ug-doc-cover no-print">
          <div className="ug-doc-cover-content">
            <div className="ug-doc-cover-brand">AdvertiseIQ <span>{t("User Documentation")}</span></div>
            <h1 className="ug-doc-cover-title">{t("User Guide")}</h1>
            <p className="ug-doc-cover-subtitle">{t("Everything you need to know about managing and optimizing your Amazon Advertising campaigns with AdvertiseIQ.")}</p>

            <div className="ug-doc-cover-actions">
              <button
                type="button"
                className="ug-download-btn primary flex items-center justify-center gap-2 cursor-pointer transition-all duration-150 border-0 focus:outline-none"
                onClick={handlePrintPdf}
              >
                <FileText className="h-4 w-4" />
                <span>{t("Download Full Manual (PDF)")}</span>
              </button>
            </div>
          </div>
          <div className="ug-doc-cover-graphic">
            <div className="ug-graphic-scene">
              <div className="ug-glass-card card-1">
                <div className="ug-card-header-mock">
                  <div className="ug-mock-dots">
                    <span className="dot"></span>
                    <span className="dot"></span>
                    <span className="dot"></span>
                  </div>
                </div>
                <div className="ug-card-body-mock">
                  <div className="ug-card-line w-full"></div>
                  <div className="ug-card-line w-5/6"></div>
                  <div className="ug-card-line w-2/3"></div>
                </div>
              </div>
              <div className="ug-glass-card card-2">
                <div className="ug-card-badge-mock">{t("Campaign Manager")}</div>
                <div className="ug-card-chart-mock">
                  <div className="chart-bar" style={{ height: "45%" }}></div>
                  <div className="chart-bar" style={{ height: "75%" }}></div>
                  <div className="chart-bar" style={{ height: "60%" }}></div>
                  <div className="chart-bar" style={{ height: "95%" }}></div>
                  <div className="chart-bar" style={{ height: "80%" }}></div>
                </div>
              </div>
              <div className="ug-graphic-glow"></div>
            </div>
          </div>
        </header>

        {/* Role Tabs */}
        <div className="ug-role-tabs glass-sticky-header sticky-top no-print">
          {Object.entries(ROLE_CONFIG).map(([role, config]) => (
            <button
              key={role}
              className={`ug-role-tab ${activeRole === role ? 'active' : ''}`}
              onClick={() => handleRoleChange(role)}
            >
              <span className="ug-role-tab-icon">{config.icon}</span>
              <div className="ug-role-tab-info">
                <span className="ug-role-tab-label">{config.label}</span>
                <span className="ug-role-tab-desc">{config.description}</span>
              </div>
              {activeRole === role && <span className="ug-role-tab-badge">{roleSections.length} {t("sections")}</span>}
            </button>
          ))}
        </div>

        {/* Main Layout: Sidebar + Content */}
        <div className="ug-layout">
          {/* Sidebar */}
          <aside
            className={`ug-sidebar no-print ${sidebarCollapsed ? 'collapsed' : ''}`}
            ref={sidebarRef}
          >
            <div className="ug-sidebar-header">
              <h3 className="ug-sidebar-title flex items-center gap-2">
                {ROLE_CONFIG[activeRole].icon}
                {!sidebarCollapsed && <span>{ROLE_CONFIG[activeRole].label}</span>}
              </h3>
              <button
                className="ug-sidebar-toggle"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                title={sidebarCollapsed ? t("Expand sidebar") : t("Collapse sidebar")}
              >
                {sidebarCollapsed ? '»' : '«'}
              </button>
            </div>

            <nav className="ug-sidebar-nav">
              {roleSections.map((section, idx) => {
                const Icon = IconMap[section.icon] || HelpCircle;
                const shortTitle = section.title.replace(/^\d+\.\s*/, '');
                return (
                  <button
                    key={section.id}
                    className={`ug-sidebar-item ${activeSection === section.id ? 'active' : ''}`}
                    onClick={() => scrollToSection(section.id)}
                    title={t(shortTitle)}
                  >
                    <span className="ug-sidebar-item-icon" style={{ color: section.color }}>
                      <Icon className="h-4 w-4" />
                    </span>
                    {!sidebarCollapsed && (
                      <>
                        <span className="ug-sidebar-item-num">{idx + 1}</span>
                        <span className="ug-sidebar-item-label">{t(shortTitle)}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="ug-main" ref={mainContentRef}>
            <div className="ug-document-container">
              <article className="ug-document">
                <div className="ug-doc-body">
                  {userGuideSections.map((section) => {
                    const Icon = IconMap[section.icon] || HelpCircle;
                    const isHidden = section.role !== activeRole;
                    return (
                      <section
                        key={section.id}
                        id={section.id}
                        className={`ug-doc-section ${isHidden ? 'hidden-section' : ''}`}
                        ref={el => sectionRefs.current[section.id] = el}
                      >
                        <div className="ug-doc-section-header">
                          <div className="ug-doc-section-icon" style={{ color: section.color }}>
                            <Icon className="h-7 w-7" />
                          </div>
                          <h2 className="ug-doc-section-title">{t(section.title)}</h2>
                          <span className={`ug-role-indicator ${section.role}`}>
                            {section.role === 'superadmin' ? t('Super Admin') : t('Seller')}
                          </span>
                        </div>

                        <div className="ug-doc-content">
                          {renderTextContent(section.content)}
                        </div>
                      </section>
                    );
                  })}

                  {roleSections.length === 0 && (
                    <div className="ug-doc-empty no-print flex flex-col items-center justify-center p-8">
                      <Search className="h-12 w-12 text-slate-300 mb-2" />
                      <h3>{t("No sections found")}</h3>
                      <p>{t("Try selecting a different role panel.")}</p>
                    </div>
                  )}
                </div>
              </article>
            </div>
          </main>
        </div>
      </div>

      {/* Back to Top */}
      <button
        className={`ug-back-to-top no-print ${showBackToTop ? 'visible' : ''}`}
        onClick={scrollToTop}
      >
        <ArrowUp className="h-5 w-5" />
      </button>
    </div>
    </>
  );
};

export default UserGuide;
