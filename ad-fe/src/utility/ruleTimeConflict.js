// ✅ Build blocked slots for selected days (used for real-time per-field highlighting)
export const getBlockedSlotsForDays = (allRulesSchedule, adminRulesSchedule, days, excludeRuleId = null) => {
    const slots = [];

    // --- Existing rule slots (point-based ±5 min) ---
    (allRulesSchedule || []).forEach((rule) => {
        if (excludeRuleId && String(rule._id) === String(excludeRuleId)) return;
        (rule.days || []).forEach((day) => {
            if (days.includes(day)) {
                (rule.times || []).forEach((time) => {
                    if (!time || !time.includes(":")) return;
                    const [h, m] = time.split(":").map(Number);
                    slots.push({
                        day,
                        totalMinutes: h * 60 + m,
                        ruleName: rule.ruleName,
                        originalTime: `${time} ±5 min`,
                        isAdminBlocked: false,
                    });
                });
            }
        });
    });

    // --- Admin blocked range slots (apply to all days) ---
    (adminRulesSchedule || []).forEach((block) => {
        if (!block.startTime || !block.endTime) return;
        const [sh, sm] = block.startTime.split(":").map(Number);
        const [eh, em] = block.endTime.split(":").map(Number);
        days.forEach((day) => {
            slots.push({
                day,
                rangeStart: sh * 60 + sm,
                rangeEnd: eh * 60 + em,
                ruleName: "Blocked by Super Admin",
                originalTime: `${block.startTime} - ${block.endTime}`,
                isAdminBlocked: true,
            });
        });
    });

    return slots;
};

// ✅ Check if a single time string conflicts with any blocked slot (±5 min) or admin range
export const isTimeConflicting = (timeStr, blockedSlots) => {
    if (!timeStr || !timeStr.includes(":")) return null;
    const [h, m] = timeStr.split(":").map(Number);
    const total = h * 60 + m;

    for (const slot of blockedSlots) {
        // Admin blocked range check — is time within [rangeStart, rangeEnd]?
        if (slot.isAdminBlocked) {
            if (total >= slot.rangeStart && total <= slot.rangeEnd) {
                return slot;
            }
        } else {
            // Point-based ±5 min check
            const diff = Math.abs(slot.totalMinutes - total);
            const wrappedDiff = Math.min(diff, 1440 - diff);
            if (wrappedDiff <= 4) {
                return slot;
            }
        }
    }

    return null;
};

// ✅ Check if a time (in minutes) falls within an admin blocked range
const isInAdminBlockedRange = (totalMinutes, adminRulesSchedule) => {
    for (const block of (adminRulesSchedule || [])) {
        if (!block.startTime || !block.endTime) continue;
        const [sh, sm] = block.startTime.split(":").map(Number);
        const [eh, em] = block.endTime.split(":").map(Number);
        const rangeStart = sh * 60 + sm;
        const rangeEnd = eh * 60 + em;
        if (totalMinutes >= rangeStart && totalMinutes <= rangeEnd) {
            return { startTime: block.startTime, endTime: block.endTime };
        }
    }
    return null;
};

// ✅ ±5 min time conflict validation utility + admin blocked range check
export const validateTimeConflict = (allRulesSchedule, adminRulesSchedule, newDays, newTimes, excludeRuleId = null) => {
    const conflicts = [];

    // Build flat list of existing (day, totalMinutes) slots
    const existingSlots = [];
    (allRulesSchedule || []).forEach((rule) => {
        // Skip self when editing
        if (excludeRuleId && String(rule._id) === String(excludeRuleId)) return;
        (rule.days || []).forEach((day) => {
            (rule.times || []).forEach((time) => {
                if (!time || !time.includes(":")) return;
                const [h, m] = time.split(":").map(Number);
                existingSlots.push({
                    day,
                    totalMinutes: h * 60 + m,
                    ruleName: rule.ruleName,
                });
            });
        });
    });

    newDays.forEach((day) => {
        newTimes.forEach((time) => {
            if (!time || typeof time !== "string" || !time.includes(":")) return;
            const [h, m] = time.split(":").map(Number);
            const newTotal = h * 60 + m;

            existingSlots.forEach((slot) => {
                if (slot.day === day) {
                    const diff = Math.abs(slot.totalMinutes - newTotal);
                    // Handle midnight wrap e.g. 23:58 vs 00:02
                    const wrappedDiff = Math.min(diff, 1440 - diff);
                    if (wrappedDiff <= 4) {
                        conflicts.push({
                            day,
                            time,
                            ruleName: slot.ruleName,
                            isAdminBlocked: false,
                        });
                    }
                }
            });

            // --- Check against admin blocked ranges ---
            const adminConflict = isInAdminBlockedRange(newTotal, adminRulesSchedule);
            if (adminConflict) {
                conflicts.push({
                    day,
                    time,
                    ruleName: "Blocked by Super Admin",
                    blockedRange: `${adminConflict.startTime} - ${adminConflict.endTime}`,
                    isAdminBlocked: true,
                });
            }
        });
    });

    return conflicts;
};

export const resolveTemplateTimes = (baseTimes, selectedDays, allRulesSchedule, adminRulesSchedule, editId) => {
    const blockedSlots = getBlockedSlotsForDays(allRulesSchedule, adminRulesSchedule, selectedDays, editId);

    const resolvedTimes = [];
    baseTimes.forEach(time => {
        if (!time || !time.includes(":")) {
            resolvedTimes.push(time);
            return;
        }
        let currentStr = time;
        let [h, m] = currentStr.split(":").map(Number);
        let total = h * 60 + m;
        let iterations = 0;

        while (isTimeConflicting(currentStr, blockedSlots) && iterations < 288) {
            total += 5;
            if (total >= 1440) total -= 1440;

            h = Math.floor(total / 60);
            m = total % 60;
            currentStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            iterations++;
        }
        resolvedTimes.push(currentStr);

        // Block this newly resolved time for subsequent times in the array
        const [rh, rm] = currentStr.split(":").map(Number);
        selectedDays.forEach(day => {
            blockedSlots.push({
                day,
                totalMinutes: rh * 60 + rm,
                ruleName: "Template Time",
                isAdminBlocked: false
            });
        });
    });
    return resolvedTimes;
};