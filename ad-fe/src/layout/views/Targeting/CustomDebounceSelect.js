import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import debounce from 'lodash/debounce';
import { ApiGetCampaignAndAdGroupAutoSearch } from '../../../api-wrapper/customer/ApiCustomer';
import { ProfileContext } from '../../../helper/usecontext/useContext';
import { MultiSelect } from '../../../components/ui/multi-select';

function DebounceSelect({ fetchOptions, debounceTimeout = 500, value = [], onChange, placeholder, ...props }) {
    const [fetching, setFetching] = useState(false);
    const [options, setOptions] = useState([]);
    const fetchRef = useRef(0);

    const debounceFetcher = useMemo(() => {
        const loadOptions = (val) => {
            fetchRef.current += 1;
            const fetchId = fetchRef.current;
            setOptions([]);
            setFetching(true);
            fetchOptions(val).then((newOptions) => {
                if (fetchId !== fetchRef.current) return;
                setOptions(newOptions || []);
                setFetching(false);
            });
        };
        return debounce(loadOptions, debounceTimeout);
    }, [fetchOptions, debounceTimeout]);

    useEffect(() => {
        let mounted = true;
        setFetching(true);
        fetchOptions('')
            .then((newOptions) => {
                if (mounted) setOptions(newOptions || []);
            })
            .finally(() => {
                if (mounted) setFetching(false);
            });

        return () => {
            mounted = false;
        };
    }, [fetchOptions]);

    // Combine selected values with fetched options so labels are preserved when searching
    const combinedOptions = useMemo(() => {
        const map = new Map();
        if (Array.isArray(value)) {
            value.forEach((val) => {
                if (val && val.value) {
                    map.set(val.value, { label: val.label || val.value, value: val.value, data: val.data });
                }
            });
        }
        if (Array.isArray(options)) {
            options.forEach((opt) => {
                if (opt && opt.value) {
                    map.set(opt.value, opt);
                }
            });
        }
        return Array.from(map.values());
    }, [value, options]);

    const selectedIds = useMemo(() => {
        return Array.isArray(value) ? value.map((v) => v?.value).filter(Boolean) : [];
    }, [value]);

    const handleMultiChange = (newIds) => {
        if (Array.isArray(newIds)) {
            const merged = newIds.map((id) => {
                const found = combinedOptions.find((opt) => opt.value === id);
                return found ? { label: found.label, value: found.value, data: found?.data } : { label: id, value: id };
            });
            onChange?.(merged);
        }
    };

    return (
        <MultiSelect
            options={combinedOptions}
            value={selectedIds}
            onChange={handleMultiChange}
            onSearch={debounceFetcher}
            loading={fetching}
            placeholder={placeholder}
            maxCount={1}
            {...props}
        />
    );
}

const CustomDebounceSelect = ({ title, value, setValue, keys }) => {
    let { profileId } = useContext(ProfileContext);
    const [data, setData] = useState([]);

    async function fetchUserList(searchName, profileId, keys) {
        try {
            const response = await ApiGetCampaignAndAdGroupAutoSearch({
                profileId: profileId?.value,
                searchName: searchName,
            });

            if (response.isSuccess && response.result) {
                setData(response?.result);
                return response.result.map((val) => ({
                    data: val,
                    label: val?.[`${keys[0]}`],
                    value: val?.[`${keys[1]}`],
                }));
            } else {
                return [];
            }
        } catch (error) {
            console.error("Error fetching campaigns data:", error);
            return [];
        }
    }

    const primitiveValue = Array.isArray(value) ? value.map(v => v.value) : [];

    return (
        <DebounceSelect
            value={value}
            placeholder={title}
            fetchOptions={(search) => fetchUserList(search, profileId, keys)}
            onChange={(newValue) => {
                if (Array.isArray(newValue)) {
                    const merged = newValue.map((selected) => {
                        const full = data.find((opt) => opt?.[`${keys[1]}`] === selected.value);
                        return full ? { ...selected, data: full } : selected;
                    });
                    setValue(merged);
                }
            }}
        />
    );
};

export default CustomDebounceSelect;