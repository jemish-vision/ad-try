import React from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiChevronRight } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

const Breadcrumb = ({ paths = [], onBack }) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center mb-3">
      {onBack && (
        <button
          onClick={onBack}
          className="btn btn-sm text-decoration-none p-0 mr-3 flex items-center bg-transparent border-0 text-slate-500 hover:text-[#3CBBF2] dark:text-slate-400 dark:hover:text-[#3CBBF2] transition-colors"
        >
          <FiArrowLeft size={16} />
        </button>
      )}

      <nav aria-label="breadcrumb">
        <ol className="flex flex-wrap items-center gap-1.5 break-words text-sm text-slate-500 dark:text-slate-400 sm:gap-2.5 mb-0 p-0 m-0 list-none">
          {paths.map((path, index) => {
            const isLast = index === paths.length - 1;

            return (
              <React.Fragment key={index}>
                <li className="inline-flex items-center gap-1.5">
                  {path.link && !isLast ? (
                    <Link
                      to={path.link}
                      className="text-decoration-none transition-colors text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                    >
                      {t(path.label)}
                    </Link>
                  ) : (
                    <span
                      role="link"
                      aria-disabled="true"
                      aria-current="page"
                      className={`font-normal ${
                        isLast
                          ? "text-slate-900 dark:text-slate-100 font-semibold"
                          : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {t(path.label)}
                    </span>
                  )}
                </li>
                {!isLast && (
                  <li role="presentation" aria-hidden="true" className="flex items-center">
                    <FiChevronRight size={14} className="opacity-50 text-slate-500 dark:text-slate-400" />
                  </li>
                )}
              </React.Fragment>
            );
          })}
        </ol>
      </nav>
    </div>
  );
};

export default Breadcrumb;
