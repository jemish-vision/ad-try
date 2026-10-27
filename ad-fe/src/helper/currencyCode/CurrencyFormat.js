
function CurrencyFormat(amount, currencyCode) {
    let code = currencyCode;
    if (!code) {
        try {
            const profile = localStorage.getItem("profile");
            if (profile) {
                const parsed = JSON.parse(profile);
                if (parsed?.currencyCode) {
                    code = parsed.currencyCode;
                }
            }
        } catch (e) {}
    }

    const isIndia = (code ?? "INR") === "INR";
    const formatted = Intl.NumberFormat(isIndia ? "en-IN" : "en-US", {
        currency: code ?? "INR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(amount);

    return formatted;
}

export default CurrencyFormat;

