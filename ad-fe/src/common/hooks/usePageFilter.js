import { useEffect, useRef, useState } from 'react';
import { ApiGetPageFilter, ApiSavePageFilter } from '../../api-wrapper/customer/ApiCustomer';

export const getUserIdFromToken = () => {
  try {
    const token = localStorage.getItem("sellerToken");
    if (!token) return null;
    const payload = token.split(".")[1];
    const decoded = JSON.parse(atob(payload));
    return decoded?.id || decoded?.userId || decoded?.user_id || decoded?.sub;
  } catch (e) {
    return null;
  }
};

const usePageFilter = ({
  pageName,
  profileId,
  selectedAdType,
  appliedFilters,
  setAppliedFilters,
  onFilterLoad
}) => {
  const isPageFilterLoadedRef = useRef(false);
  const [isFilterReady, setIsFilterReady] = useState(false);

  const getPageFilter = async () => {
    if (profileId && selectedAdType) {
      const userId = getUserIdFromToken();
      if (!userId) {
        setIsFilterReady(true);
        return;
      }
      
      const data = { userId, profileId, pageName };
      await ApiGetPageFilter(data)
        .then((res) => {
          if (res?.isSuccess && res?.data?.filter !== undefined) {
            try {
              const savedFilters = res.data.filter ? JSON.parse(res.data.filter) : [];
              
              if (onFilterLoad) {
                onFilterLoad(savedFilters);
              }
              
              setAppliedFilters(savedFilters);
            } catch (e) {
              console.error("Failed to parse page filter", e);
            }
          }
        })
        .catch(e => console.error(e))
        .finally(() => {
          isPageFilterLoadedRef.current = true;
          setIsFilterReady(true);
        });
    }
  };

  useEffect(() => {
    if (profileId && selectedAdType && pageName) {
      isPageFilterLoadedRef.current = false;
      setIsFilterReady(false);
      getPageFilter();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, selectedAdType, pageName]);

  useEffect(() => {
    // Only save if it was loaded first, to prevent overwriting with initial empty array
    if (isPageFilterLoadedRef.current && profileId && selectedAdType && pageName) {
      const savePageFilter = async () => {
        const userId = getUserIdFromToken();
        if (!userId) return;
        let isFilterEmpty = false;
        if (Array.isArray(appliedFilters)) {
          isFilterEmpty = appliedFilters.length === 0;
        } else if (appliedFilters && typeof appliedFilters === "object") {
          isFilterEmpty = Object.values(appliedFilters).every(val => !val || val === "");
        }

        const payload = {
          userId,
          profileId,
          pageName,
          filter: isFilterEmpty ? "" : JSON.stringify(appliedFilters)
        };
        await ApiSavePageFilter(payload).catch(e => console.error(e));
      };
      
      const timer = setTimeout(() => {
        savePageFilter();
      }, 1000); // Debounce to prevent spamming
      
      return () => clearTimeout(timer);
    }
  }, [appliedFilters, profileId, selectedAdType, pageName]);

  return { isFilterReady };
};

export default usePageFilter;
