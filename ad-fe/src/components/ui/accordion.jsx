import * as React from "react";
import { cn } from "src/lib/utils";

const AccordionContext = React.createContext(null);
const ItemContext = React.createContext(null);

function Accordion({
  defaultActiveKey,
  activeKey,
  alwaysOpen = false,
  onSelect,
  className,
  children,
  ...props
}) {
  const [internalKeys, setInternalKeys] = React.useState(() => {
    if (defaultActiveKey !== undefined && defaultActiveKey !== null) {
      return Array.isArray(defaultActiveKey) ? defaultActiveKey.map(String) : [String(defaultActiveKey)];
    }
    return [];
  });

  const isControlled = activeKey !== undefined && activeKey !== null;

  const currentKeys = React.useMemo(() => {
    if (isControlled) {
      return Array.isArray(activeKey) ? activeKey.map(String) : [String(activeKey)];
    }
    return internalKeys;
  }, [isControlled, activeKey, internalKeys]);

  const isItemOpen = React.useCallback(
    (key) => {
      if (key === undefined || key === null) return false;
      return currentKeys.some((k) => String(k) === String(key));
    },
    [currentKeys]
  );

  const toggleKey = React.useCallback(
    (key) => {
      if (key === undefined || key === null) return;
      const strKey = String(key);
      const isMulti = alwaysOpen || Array.isArray(defaultActiveKey) || Array.isArray(activeKey);
      const isOpen = isItemOpen(strKey);

      let nextKeys;
      if (isMulti) {
        if (isOpen) {
          nextKeys = currentKeys.filter((k) => String(k) !== strKey);
        } else {
          nextKeys = [...currentKeys, strKey];
        }
      } else {
        nextKeys = isOpen ? [] : [strKey];
      }

      if (!isControlled) {
        setInternalKeys(nextKeys);
      }
      if (onSelect) {
        onSelect(isMulti ? nextKeys : (nextKeys[0] ?? null));
      }
    },
    [isControlled, alwaysOpen, defaultActiveKey, activeKey, isItemOpen, currentKeys, onSelect]
  );

  const contextValue = React.useMemo(
    () => ({ isItemOpen, toggleKey, currentKeys }),
    [isItemOpen, toggleKey, currentKeys]
  );

  return (
    <AccordionContext.Provider value={contextValue}>
      <div className={cn("space-y-3 w-full", className)} {...props}>
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

function AccordionItem({ eventKey, className, children, ...props }) {
  const accordionContext = React.useContext(AccordionContext);
  const isOpen = accordionContext ? accordionContext.isItemOpen(eventKey) : false;
  const toggle = React.useCallback(() => {
    if (accordionContext) accordionContext.toggleKey(eventKey);
  }, [accordionContext, eventKey]);

  const itemValue = React.useMemo(
    () => ({ eventKey, isOpen, toggle }),
    [eventKey, isOpen, toggle]
  );

  return (
    <ItemContext.Provider value={itemValue}>
      <div
        className={cn(
          "border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm transition-all duration-200",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </ItemContext.Provider>
  );
}

function AccordionHeader({ className, children, onClick, ...props }) {
  const itemContext = React.useContext(ItemContext);
  const isOpen = itemContext?.isOpen ?? false;

  const handleClick = (e) => {
    itemContext?.toggle();
    if (onClick) onClick(e);
  };

  return (
    <h3 className="m-0 flex">
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "flex flex-1 items-center justify-between py-3.5 px-4 font-semibold transition-all hover:bg-slate-50 dark:hover:bg-white/5 text-slate-800 dark:text-slate-100 text-left text-sm cursor-pointer border-0 bg-transparent w-full focus:outline-none",
          isOpen && "text-sky-600 dark:text-sky-400 bg-slate-50/50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/5",
          className
        )}
        {...props}
      >
        <span className="flex-1 font-bold">{children}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200 text-slate-400 dark:text-slate-500",
            isOpen && "rotate-180 text-sky-600 dark:text-sky-400"
          )}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </h3>
  );
}

function AccordionBody({ className, children, ...props }) {
  const itemContext = React.useContext(ItemContext);
  const isOpen = itemContext?.isOpen ?? false;

  return (
    <div
      className={cn(
        "grid transition-all duration-300 ease-in-out",
        isOpen
          ? "grid-rows-[1fr] opacity-100"
          : "grid-rows-[0fr] opacity-0 pointer-events-none"
      )}
      aria-hidden={!isOpen}
    >
      <div className="overflow-hidden">
        <div
          className={cn(
            "p-4 text-sm text-slate-600 dark:text-slate-300",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function AccordionCollapse({ eventKey: propEventKey, className, children, ...props }) {
  const accordionContext = React.useContext(AccordionContext);
  const itemContext = React.useContext(ItemContext);
  const key = propEventKey !== undefined ? propEventKey : itemContext?.eventKey;
  const isOpen = accordionContext ? accordionContext.isItemOpen(key) : false;

  return (
    <div
      className={cn(
        "grid transition-all duration-300 ease-in-out",
        isOpen
          ? "grid-rows-[1fr] opacity-100"
          : "grid-rows-[0fr] opacity-0 pointer-events-none"
      )}
      aria-hidden={!isOpen}
    >
      <div className="overflow-hidden">
        <div className={cn(className)} {...props}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function useAccordionButton(eventKey, onClick) {
  const context = React.useContext(AccordionContext);
  return (e) => {
    if (context) {
      context.toggleKey(eventKey);
    }
    if (onClick) {
      onClick(e);
    }
  };
}

Accordion.Item = AccordionItem;
Accordion.Header = AccordionHeader;
Accordion.Body = AccordionBody;
Accordion.Collapse = AccordionCollapse;

export { Accordion, AccordionItem, AccordionHeader, AccordionBody, AccordionCollapse };
export default Accordion;
