import { useState, useContext } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "../../../../components/ui/dialog"
import { Button } from "../../../../components/ui/button"
import { Input } from "../../../../components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../../../../components/ui/select"
import { ProfileContext } from '../../../../helper/usecontext/useContext';
import { ApiAdjustBids } from '../../../../api-wrapper/targeting/ApiTargeting';
import { useDispatch } from 'react-redux';
import { handleLoader, Toast } from '../../../../helper/links/Link';
import { useTranslation } from 'react-i18next';
import { getCurrencySymbol, getMarketplaceMinBid } from '../../../../helper/currencyCode/CurrencyCode';

const TargetingAdjustBidModal = (props) => {
    const { t } = useTranslation();
    const { currencyCode, countryCode } = useContext(ProfileContext);
    const minBid = getMarketplaceMinBid(currencyCode, countryCode);
    const currSymbol = getCurrencySymbol(currencyCode);

    const [bidValue, setBidValue] = useState("");
    const [selectedAction, setSelectedAction] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);


    const dispatch = useDispatch();
    const {
        profileId,
        showBidModal,
        setShowBidModal,
        selectedRows,
        setSelectedRows,
        handleSubmit
    } = props;

    const handleSave = async () => {
        const numericValue = parseFloat(bidValue);

        // Validation 1: Check if action selected
        if (!selectedAction) {
            setError(t("Please select a bid action."));
            return;
        }

        // Validation 2: Check valid number
        if (isNaN(numericValue)) {
            setError(t("Please enter a valid bid value."));
            return;
        }

        // Validation 3: Range check for percentage
        if (
            ["INCREASE_PERCENTAGE", "DECREASE_PERCENTAGE"].includes(selectedAction) &&
            (numericValue <= 0 || numericValue > 100)
        ) {
            setError(t("Percentage value must be between 1 and 100."));
            return;
        }

        // Validation 4: Set bid minimum check
        if (selectedAction === "SET_BID" && numericValue < minBid) {
            setError(`${t("Bid must be at least")} ${currSymbol}${minBid.toFixed(2)}`);
            return;
        }

        // Validation 5: Increase/Decrease number check
        if (["INCREASE_NUMBER", "DECREASE_NUMBER"].includes(selectedAction) && numericValue <= 0) {
            setError(t("Adjustment amount must be greater than 0."));
            return;
        }

        try {
            setLoading(true);
            const body = {
                profileId: profileId?.value,
                targetIds: selectedRows,
                bid: numericValue,
                actionType: selectedAction,
            };
            
            const response = await ApiAdjustBids(body);

            if (response?.isSuccess) {
                Toast.success(response?.message || t("Bid adjusted successfully"));
                setBidValue("");
                setSelectedRows([]);
                await handleSubmit();
                setShowBidModal(false);
            } else {
                Toast.error(response?.message || t("Failed to adjust bid"));
            }
            dispatch(handleLoader(false));
        } catch (error) {
            Toast.error(t("Something went wrong while adjusting the bid"));
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={showBidModal} onOpenChange={(open) => !open && setShowBidModal(false)}>
            <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden border-0 rounded-2xl shadow-xl bg-white dark:bg-[#1e293b]">
                <DialogHeader className="border-b border-slate-100 dark:border-slate-800 p-5 px-6">
                    <DialogTitle className="flex items-center gap-2 text-[16px] font-bold text-slate-800 dark:text-slate-100">
                        {t("Bid Adjustment")}
                        <span className="text-primary text-sm font-semibold pl-3 m-0">
                            {t("Selected")}: {selectedRows.length} {selectedRows.length === 1 ? t("row") : t("rows")}
                        </span>
                    </DialogTitle>
                </DialogHeader>

                <div className="p-6 bg-white dark:bg-[#1e293b]">
                    <div className="flex items-center gap-4 mb-2">
                        {/* Bid Action Dropdown */}
                        <div className="w-1/2">
                            <Select
                                value={selectedAction}
                                onValueChange={(val) => {
                                    setSelectedAction(val);
                                    setError("");
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={t("Select Bid Action")} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="INCREASE_NUMBER">{t("Increase By Number")}</SelectItem>
                                    <SelectItem value="INCREASE_PERCENTAGE">{t("Increase By Percentage")}</SelectItem>
                                    <SelectItem value="SET_BID">{t("Set Bid")}</SelectItem>
                                    <SelectItem value="DECREASE_NUMBER">{t("Decrease By Number")}</SelectItem>
                                    <SelectItem value="DECREASE_PERCENTAGE">{t("Decrease By Percentage")}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Bid Value Input */}
                        <div className="flex items-center w-1/2 relative">
                            <Input
                                type="number"
                                min={selectedAction === "SET_BID" ? minBid : "0.01"}
                                step="0.01"
                                value={bidValue}
                                onChange={(e) => {
                                    setBidValue(e.target.value);
                                    if (error) setError("");
                                }}
                                className={`w-full pr-8 ${error ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                                placeholder={selectedAction === "SET_BID" ? `Min ${currSymbol}${minBid.toFixed(2)}` : t("Enter bid")}
                            />
                            {/* Symbol based on selection */}
                            <span className="absolute right-3 text-slate-400 font-semibold text-sm">
                                {["INCREASE_PERCENTAGE", "DECREASE_PERCENTAGE"].includes(selectedAction) ? "%" : currSymbol}
                            </span>
                        </div>
                    </div>

                    <div className="text-[12px] text-slate-500 dark:text-slate-400 mt-2">
                        <i className="fa-solid fa-circle-info text-blue-500 mr-1.5" />
                        {t("Minimum allowed bid is")} {currSymbol}{minBid.toFixed(2)}. {t("Resulting bids will not be reduced below this limit.")}
                    </div>

                    {error && (
                        <div className="text-red-500 text-sm mt-2 flex items-center gap-1">
                            <i className="bi bi-exclamation-circle-fill"></i>
                            {error}
                        </div>
                    )}
                </div>

                <DialogFooter className="bg-white dark:bg-[#1e293b] border-t border-slate-100 dark:border-slate-800 p-4 px-6 sm:justify-end sm:space-x-3">
                    <Button
                        variant="ghost"
                        disabled={loading}
                        onClick={() => setShowBidModal(false)}
                        className="text-slate-500 hover:text-slate-700 hover:bg-transparent"
                    >
                        {t("Cancel")}
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!!error || loading}
                        className="btn-campaign-primary flex items-center gap-1.5"
                    >
                        {loading && <i className="fa-solid fa-spinner fa-spin mr-1.5" />}
                        {loading ? t("Saving...") : t("save")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default TargetingAdjustBidModal